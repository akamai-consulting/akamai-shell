'use strict';

const repl = require('node:repl');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { exec } = require('node:child_process');
const { PassThrough } = require('node:stream');
const apiRegistry = require('./api-registry');
const { sortCandidates } = require('./path-completion');
const { findResources } = require('./find');
const { createRecorder } = require('./recorder');

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_STATE_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'state.js');
const DEFAULT_STARTUP_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'startup.js');

function asText(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function loadSettings(options) {
  const file = options.environmentFile ||
    path.join(os.homedir(), '.config', 'akamai-shell', 'env');
  let parameters = {};
  try {
    const environment = JSON.parse(fs.readFileSync(file, 'utf8'));
    parameters = environment.parameters || environment;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Unable to load parameter file ${file}: ${error.message}`);
  }
  const target = {
    ...(parameters.target || {}),
    ...Object.fromEntries(['accountSwitchKey', 'contractId', 'groupId']
      .filter((name) => parameters[name] !== undefined)
      .map((name) => [name, parameters[name]]))
  };
  const settings = {
    edgerc: parameters.edgerc || path.join(os.homedir(), '.edgerc'),
    edgercSection: parameters.edgercSection || 'default',
    accountSwitchKey: parameters.accountSwitchKey || '',
    contractId: parameters.contractId || '',
    groupId: parameters.groupId || '',
    timeout: {
      default: Number(parameters.timeout?.default) || DEFAULT_TIMEOUT,
      ...(parameters.timeout || {})
    },
    target,
    parameterDefaults: { ...parameters },
    ...(options.settings || {})
  };
  return settings;
}

function isPersistable(value, seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (value instanceof Date) return true;
  seen.add(value);
  if (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) return false;
  return Object.keys(value).every((key) => isPersistable(value[key], seen));
}

function transformCommandSubstitutions(source) {
  let result = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      result += character;
      continue;
    }
    if (character !== '$') {
      result += character;
      continue;
    }
    let open = index + 1;
    while (/\s/.test(source[open] || '')) open += 1;
    if (source[open] !== '(') {
      result += character;
      continue;
    }
    let depth = 1;
    let innerQuote = '';
    let innerEscaped = false;
    let close = open + 1;
    for (; close < source.length && depth; close += 1) {
      const innerCharacter = source[close];
      if (innerQuote) {
        if (innerEscaped) innerEscaped = false;
        else if (innerCharacter === '\\') innerEscaped = true;
        else if (innerCharacter === innerQuote) innerQuote = '';
      } else if (innerCharacter === '"' || innerCharacter === "'" || innerCharacter === '`') {
        innerQuote = innerCharacter;
      } else if (innerCharacter === '(') {
        depth += 1;
      } else if (innerCharacter === ')') {
        depth -= 1;
      }
    }
    if (depth) throw new Error('Unterminated JavaScript $() expression');
    result += `(await ${source.slice(index, close)})`;
    index = close - 1;
  }
  return result;
}

function splitPipeline(source) {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === '|') {
      const left = source.slice(0, index).trim();
      const right = source.slice(index + 1).trim();
      if (!left || !right) throw new Error('Pipeline requires commands on both sides');
      return { left, right };
    }
  }
  return null;
}

function words(source) {
  const result = [];
  let current = '';
  let quote;
  let escaped = false;
  for (const character of String(source).trim()) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === "'" || character === '"') quote = character;
    else if (/\s/.test(character)) {
      if (current) { result.push(current); current = ''; }
    } else current += character;
  }
  if (escaped || quote) throw new Error('Malformed command: unterminated quote or escape');
  if (current) result.push(current);
  return result;
}

function parseCommand(source) {
  const tokens = words(source);
  if (!tokens.length) return null;
  const command = tokens.shift().toLowerCase();
  if (command === '!') {
    if (!tokens.length) throw new Error('! expects a shell command');
    return { command, source: tokens.join(' ') };
  }
  if (!['get', 'post', 'put', 'find', 'show', 'echo', 'history', 'record',
    'set', 'save', 'load', 'help', '?', 'exit', 'quit'].includes(command)) return null;
  if (command === '?' || command === 'help' || command === 'exit' || command === 'quit') {
    if (tokens.length) throw new Error(`${command} does not accept arguments`);
    return { command };
  }
  if (command === 'save' || command === 'load') {
    if (tokens.length > 1) throw new Error(`${command} accepts at most one path`);
    return { command, filePath: tokens[0] || DEFAULT_STATE_FILE };
  }
  if (command === 'echo') return { command, words: tokens };
  if (command === 'history') {
    if (tokens.length) throw new Error('history does not accept arguments');
    return { command };
  }
  if (command === 'record') return { command, action: tokens.shift(), options: tokens };
  if (command === 'find') {
    if (!tokens.length) throw new Error('Usage: find <api-path> -q <match-rule>');
    const apiPath = tokens.shift();
    if (tokens.length !== 2 || tokens[0] !== '-q') {
      throw new Error('Usage: find <api-path> -q <match-rule>');
    }
    return { command, apiPath, query: tokens[1] };
  }
  if (command === 'show') {
    return { command, name: source.trim().slice(command.length).trim() };
  }
  if (command === 'set') {
    if (tokens.length < 2) throw new Error('Usage: set <name> <value>');
    return { command, name: tokens.shift(), value: tokens.join(' ') };
  }
  if (!tokens.length || !tokens[0].startsWith('/')) throw new Error(`Usage: ${command} <api-path>`);
  const rawPath = tokens.shift();
  const [apiPath, queryString] = rawPath.split('?', 2);
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));
  const body = {};
  for (const token of tokens) {
    const match = token.match(/^([^:=]+)(==|:=|=)(.*)$/);
    if (!match) throw new Error(`Invalid ${command} argument "${token}"`);
    const [, name, operator, value] = match;
    if (operator === '==') query[name] = value;
    else if (command === 'get') {
      throw new Error(`GET query argument "${token}" must use name==value`);
    }
    else if (operator === ':=') {
      try { body[name] = JSON.parse(value); } catch (error) {
        throw new Error(`Invalid JSON value for ${name}: ${error.message}`);
      }
    } else body[name] = value;
  }
  return { command, apiPath, query, body };
}

class Backend {
  constructor(options = {}) {
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.outputWrite = this.output.write.bind(this.output);
    this.timeout = Number.isFinite(options.timeout) ? options.timeout : DEFAULT_TIMEOUT;
    this.standalone = options.standalone === true;
    this.mode = 'interactive';
    this.settings = loadSettings(options);
    this.requestGet = options.requestGet;
    this.apiRegistry = options.apiRegistry || apiRegistry;
    this.completionCache = new Map();
    this.history = [];
    this.settings.recorder = createRecorder();
    Object.defineProperty(this.settings, 'recorder', { enumerable: false });
    this.settings.recorder.setMode(this.settings.recordMode || 'auto');
    if (!this.settings.timeout || typeof this.settings.timeout !== 'object') {
      this.settings.timeout = { default: DEFAULT_TIMEOUT };
    }
    if (!Number.isFinite(options.timeout)) {
      this.timeout = this.settings.timeout.default;
    } else {
      this.settings.timeout.default = options.timeout;
    }
    this.initialGlobals = new Set(Object.keys(globalThis));
    globalThis.config = this.settings;
    this.initialized = false;
    this.closed = false;
    this.queue = Promise.resolve();
    this.buffer = '';
    globalThis.$ = (source) => this.command(source, { substitution: true });

    // A native REPL is deliberately kept alive for the lifetime of the
    // backend.  Its global context is also the context used by evaluate().
    this.repl = repl.start({
      input: options.replInput || new PassThrough(),
      output: options.replOutput || new PassThrough(),
      terminal: false,
      useGlobal: true,
      prompt: ''
    });
    this._onData = (chunk) => {
      this.buffer += chunk.toString();
      let newline;
      while ((newline = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (line.trim()) this.enqueueLine(line);
      }
    };
    this.input.on('data', this._onData);
    this._onEnd = () => this.shutdown();
    this.input.once('end', this._onEnd);
  }

  write(message) {
    if (!this.closed) this.outputWrite(`${JSON.stringify(message)}\n`);
  }

  enqueueLine(line) {
    this.queue = this.queue.then(() => this.handleLine(line)).catch((error) => {
      this.write({ type: 'error', error: this.errorObject(error) });
    });
    return this.queue;
  }

  errorObject(error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      ...(error.stack ? { stack: error.stack } : {})
    };
  }

  async handleLine(line) {
    let request;
    try {
      request = JSON.parse(line);
    } catch (error) {
      this.write({ type: 'error', error: this.errorObject(new Error(`Invalid JSON request: ${error.message}`)) });
      this.write({ type: 'done' });
      return;
    }
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      this.write({ id: request && request.id, type: 'error', error: this.errorObject(new Error('Request must be a JSON object')) });
      this.write({ id: request && request.id, type: 'done' });
      return;
    }
    const id = request.id;
    if (request.type === 'evaluate' || request.type === 'command') {
      this.history.push(request.source || request.code || '');
    }
    try {
      let result;
      switch (request.type) {
        case 'initialize':
          await this.initialize(request);
          result = { ready: true };
          break;
        case 'evaluate':
          result = await this.evaluate(request.source || request.code || '', request.timeout);
          break;
        case 'command':
          result = await this.command(request.source || request.code || '');
          this.write({ id, type: 'result', result });
          this.write({ id, type: 'done' });
          if (result && result.exited) await this.shutdown();
          return;
        case 'complete':
          result = await this.complete(request.source || request.code || '', request.cursor);
          break;
        case 'context-help':
          result = await this.contextHelp(request.source || request.code || '');
          break;
        case 'exit':
          result = { exited: true };
          this.write({ id, type: 'result', result });
          this.write({ id, type: 'done' });
          await this.shutdown();
          return;
        default:
          throw new Error(`Unknown request type: ${request.type}`);
      }
      this.write({ id, type: 'result', result });
      this.write({ id, type: 'done' });
    } catch (error) {
      this.write({ id, type: 'error', error: this.errorObject(error) });
      this.write({ id, type: 'done' });
    }
  }

  captureOutput() {
    const stdout = [];
    const stderr = [];
    const originalConsole = global.console;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const render = (values) => `${values.map(asText).join(' ')}\n`;
    global.console = {
      ...originalConsole,
      log: (...values) => stdout.push(render(values)),
      info: (...values) => stdout.push(render(values)),
      warn: (...values) => stderr.push(render(values)),
      error: (...values) => stderr.push(render(values))
    };
    process.stdout.write = (chunk) => {
      stdout.push(chunk.toString());
      return true;
    };
    process.stderr.write = (chunk) => {
      stderr.push(chunk.toString());
      return true;
    };
    return {
      stdout,
      stderr,
      restore() {
        global.console = originalConsole;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
      }
    };
  }

  async evaluate(code, timeout) {
    if (typeof code !== 'string' || !code.trim()) return { value: undefined };
    const evaluatedCode = this.mode === 'interactive'
      ? transformCommandSubstitutions(code)
      : code;
    const capture = this.captureOutput();
    try {
      const value = await new Promise((resolve, reject) => {
        let settled = false;
        const configuredTimeout = Number(this.settings.timeout?.default);
        const duration = Number.isFinite(timeout)
          ? timeout
          : (Number.isFinite(configuredTimeout) ? configuredTimeout : this.timeout);
        const previousError = this.repl.lastError;
        this.repl.lastError = undefined;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('Evaluation timed out'));
        }, duration);
        this.repl.eval(`${evaluatedCode}\n`, this.repl.context, __filename, (error, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(result);
        });
        if (this.repl.lastError && this.repl.lastError !== previousError && !settled) {
          settled = true;
          clearTimeout(timer);
          reject(this.repl.lastError);
        }
      });

      for (const text of capture.stdout) this.write({ type: 'stdout', data: text });
      for (const text of capture.stderr) this.write({ type: 'stderr', data: text });
      return { value };
    } finally {
      capture.restore();
    }
  }

  async command(source) {
    const pipeline = splitPipeline(source);
    if (pipeline) {
      const result = await this.command(pipeline.left);
      const input = result === undefined
        ? ''
        : (typeof result === 'string' ? result : `${JSON.stringify(result, null, 2)}\n`);
      return new Promise((resolve, reject) => {
        exec(pipeline.right, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Pipeline command failed: ${stderr.trim() || error.message}`));
            return;
          }
          resolve(stdout);
        }).stdin?.end(input);
      });
    }
    const expandedSource = this.expandCommandVariables(source);
    const parsed = parseCommand(expandedSource);
    if (!parsed) return (await this.evaluate(source)).value;
    this.syncSettings();
    if (parsed.command === '?' || parsed.command === 'help') {
      return 'get <api-path> [query]\npost|put <api-path> [name=value|name:=json]\nfind <api-path> -q <match-rule>\nset <name> <value>\necho <value>\nhistory\nrecord (auto|on|off|show)\nshow\nsave [path]\nload [path]\nhelp\nexit';
    }

    if (parsed.command === 'exit' || parsed.command === 'quit') return { exited: true };
    if (parsed.command === '!') {
      return new Promise((resolve, reject) => {
        exec(parsed.source, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Shell command failed: ${stderr.trim() || error.message}`));
            return;
          }
          resolve(stdout);
        });
      });
    }
    if (parsed.command === 'set') {
      const name = parsed.name === 'edgerc-section' ? 'edgercSection' : parsed.name;
      const value = name === 'edgerc' && parsed.value.startsWith('~')
        ? path.join(os.homedir(), parsed.value.slice(2)) : parsed.value;
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`Invalid setting name "${parsed.name}"`);
      this.settings[name] = value;
      this.settings.parameterDefaults[name] = value;
      if (['accountSwitchKey', 'contractId', 'groupId'].includes(name)) {
        this.settings.target[name] = value;
      }
      return undefined;
    }
    if (parsed.command === 'echo') {
      return parsed.words.map((word) => {
        const match = word.match(/^\$([A-Za-z_$][\w$]*)$/);
        if (!match) return word;
        const value = globalThis[match[1]];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }).join(' ');
    }
    if (parsed.command === 'history') return this.history.slice(-1000);
    if (parsed.command === 'record') {
      if (parsed.action === 'show') {
        if (parsed.options.length > 1 ||
            (parsed.options.length === 1 && parsed.options[0] !== '--http')) {
          throw new Error('Usage: record show [--http]');
        }
        return parsed.options[0] === '--http'
          ? this.settings.recorder.http()
          : this.settings.recorder.jsonl();
      }
      if (parsed.options.length || !['auto', 'on', 'off'].includes(parsed.action)) {
        throw new Error('Usage: record (auto|on|off) or record show [--http]');
      }
      this.settings.recorder.setMode(parsed.action);
      this.settings.recordMode = parsed.action;
      return parsed.action;
    }
    if (parsed.command === 'find') {
      return (await findResources(this.settings, parsed.apiPath, parsed.query, this.requestGet))
        .map((match) => ({ path: match.path, resource: match.resource }));
    }
    if (parsed.command === 'save') return this.saveState(parsed.filePath);
    if (parsed.command === 'load') return this.loadState(parsed.filePath);
    if (parsed.command === 'show') {
      if (parsed.name) {
        const result = await this.evaluate(parsed.name);
        if (result.value === undefined) throw new Error(`Show expression "${parsed.name}" is undefined`);
        return result.value;
      }
      return this.userVariables();
    }
    const method = parsed.command.toUpperCase();
    const response = method === 'GET'
      ? await this.apiRegistry.get(this.settings, parsed.apiPath, parsed.query, this.requestGet)
      : await this.apiRegistry.dispatch(method, this.settings, parsed.apiPath, parsed.query, parsed.body, this.requestGet);
    return response.body;
  }

  expandCommandVariables(source) {
    return String(source).replace(/\$([A-Za-z_$][\w$]*)/g, (match, name) => {
      if (!(name in globalThis)) throw new Error(`undefined variable: ${name}`);
      const value = globalThis[name];
      if (typeof value === 'string') return value;
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error(`cannot expand variable: ${name}`);
      return serialized;
    });
  }

  saveState(filePath) {
    const lines = [
      '// Generated by akamai-shell. This file is executable JavaScript.',
      ''
    ];
    for (const [name, value] of Object.entries(this.userVariables())) {
      if (value === undefined) continue;
      const original = globalThis[name];
      if (typeof original === 'function') {
        lines.push(`globalThis.${name} = ${Function.prototype.toString.call(original)};`);
        continue;
      }
      const serialized = JSON.stringify(value, null, 2);
      if (serialized !== undefined) lines.push(`globalThis.${name} = ${serialized};`);
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, { mode: 0o600 });
    return filePath;
  }

  loadState(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    return this.evaluate(source).then(() => {
      this.syncSettings();
      return filePath;
    });
  }

  syncSettings() {
    if (!globalThis.config || typeof globalThis.config !== 'object' || Array.isArray(globalThis.config)) {
      throw new Error('config must be an object');
    }
    this.settings = globalThis.config;
    if (!this.settings.recorder) {
      Object.defineProperty(this.settings, 'recorder', {
        value: createRecorder(),
        enumerable: false,
        configurable: true
      });
      this.settings.recorder.setMode(this.settings.recordMode || 'auto');
    }
  }

  userVariables() {
    const variables = {};
    for (const name of Object.keys(globalThis)) {
      if ((name !== 'config' && this.initialGlobals.has(name)) ||
          ['$', '__filename', '__dirname', 'require', 'module', 'exports'].includes(name) ||
          !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      const value = globalThis[name];
      if (value === undefined) continue;
      if (typeof value === 'function') {
        variables[name] = Function.prototype.toString.call(value);
      } else if (isPersistable(value)) {
        variables[name] = value;
      }
    }
    return variables;
  }

  async initialize(options = {}) {
    if (this.initialized) return;
    this.mode = options.scriptPath ? 'script' : 'interactive';
    if (options.workingDirectory) process.chdir(path.resolve(options.workingDirectory));
    if (options.scriptPath) {
      const scriptPath = path.resolve(options.scriptPath);
      process.argv = [process.argv[0], scriptPath, ...(options.scriptArgs || [])];
      globalThis.__filename = scriptPath;
      globalThis.__dirname = path.dirname(scriptPath);
      globalThis.require = Module.createRequire(scriptPath);
    } else {
      globalThis.__filename = __filename;
      globalThis.__dirname = __dirname;
      globalThis.require = require;
    }
    const startupFile = options.startupFile || DEFAULT_STARTUP_FILE;
    let startupSource;
    try {
      startupSource = fs.readFileSync(startupFile, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.initialized = true;
        return;
      }
      throw new Error(`Unable to read startup file ${startupFile}: ${error.message}`, { cause: error });
    }
    try {
      await this.evaluate(startupSource);
      this.syncSettings();
    } catch (error) {
      throw new Error(`Unable to evaluate startup file ${startupFile}: ${error.message}`, { cause: error });
    }
    this.initialized = true;
  }

  complete(code, cursor) {
    this.syncSettings();
    const source = String(code || '').slice(0, Number.isInteger(cursor) ? cursor : undefined);
    const showMatch = source.match(/^show\s+(.+)$/);
    if (showMatch) {
      const [, expression] = showMatch;
      const variableCompletion = this.completeVariableExpression(expression);
      if (variableCompletion) {
        return Promise.resolve({
          candidates: variableCompletion.candidates.map((candidate) => `show ${candidate}`),
          replacement: `show ${variableCompletion.replacement}`
        });
      }

      if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
        return new Promise((resolve, reject) => {
          this.repl.complete(expression, (error, result) => {
            if (error) {
              reject(error);
              return;
            }
            resolve({
              candidates: result[0].map((candidate) => `show ${candidate}`),
              replacement: `show ${result[1]}`
            });
          });
        });
      }
    }
    const variableCompletion = this.completeVariableExpression(source);
    if (variableCompletion) return Promise.resolve(variableCompletion);
    const commandMatch = source.match(/^(get|post|put|find)\s+(\S*)$/);
    if (commandMatch) {
      const [, method, pathToken] = commandMatch;
      const inputPath = this.expandCompletionPath(pathToken || '/');
      return this.apiRegistry.completeMethod(
        method === 'find' ? 'GET' : method.toUpperCase(),
        inputPath,
        this.settings,
        this.completionCache,
        this.requestGet
      ).then(([candidates]) => ({
        candidates: candidates.map((candidate) => {
          const suffix = candidate.startsWith(inputPath)
            ? `${pathToken}${candidate.slice(inputPath.length)}`
            : candidate;
          return candidate === inputPath &&
              typeof this.apiRegistry.hasCompletionDescendants === 'function' &&
              !this.apiRegistry.hasCompletionDescendants(
                method === 'find' ? 'GET' : method.toUpperCase(), inputPath)
            ? `${suffix} `
            : suffix;
        }),
        replacement: pathToken
      }));
    }

    const parameterMatch = source.match(/^(get|post|put|find)\s+(\S+)\s+(\S*)$/);
    if (parameterMatch) {
      const [, method, pathToken, partial] = parameterMatch;
      const apiPath = this.expandCompletionPath(pathToken);
      const parameters = this.apiRegistry.parameterHelp(
        method === 'find' ? 'GET' : method.toUpperCase(), apiPath);
      const names = [...new Set(parameters.map((parameter) => parameter.name))]
        .filter((name) => name.startsWith(partial))
        .sort((left, right) => left.localeCompare(right));
      const prefix = partial ? source.slice(0, -partial.length) : source;
      return Promise.resolve({
        candidates: names.map((name) => {
          const parameter = parameters.find((item) => item.name === name);
          const operator = method === 'get' || parameter?.in === 'query' ? '==' : '=';
          return `${prefix}${name}${operator}`;
        }),
        replacement: source
      });
    }

    const setMatch = source.match(/^set\s+(\S*)$/);
    if (setMatch) {
      const knownSettings = ['accountSwitchKey', 'contractId', 'edgerc', 'edgerc-section',
        'edgercSection', 'groupId', 'logLevel', 'logOutput', 'recordMode', 'target', 'timeout'];
      const partial = setMatch[1];
      return Promise.resolve({
        candidates: knownSettings
          .filter((name) => name.startsWith(partial))
          .map((name) => `set ${name}`),
        replacement: `set ${partial}`
      });
    }
    const shellCommands = ['get', 'post', 'put', 'find', 'show', 'set', 'echo', 'history',
      'record', 'save', 'load', 'help', 'exit', 'quit'];
    if (/^[A-Za-z_$][\w$]*$/.test(source)) {
      return new Promise((resolve, reject) => {
        this.repl.complete(source, (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({
            candidates: sortCandidates(new Set([
              ...shellCommands.filter((command) => command.startsWith(source)),
              ...result[0]
            ])),
            replacement: result[1]
          });
        });
      });
    }
    return new Promise((resolve, reject) => {
      const callback = (error, result) => {
        if (error) reject(error);
        else resolve({ candidates: result[0], replacement: result[1] });
      };
      // Node's public REPL completer currently accepts (line, callback);
      // retain cursor handling for custom REPL implementations.
      this.repl.completer(source, callback);
    });
  }

  contextHelp(source) {
    const match = String(source).match(/^(get|post|put)\s+(\S+)\s+$/);
    if (!match) return [];
    const [, method, pathToken] = match;
    const apiPath = this.expandCompletionPath(pathToken);
    const parameters = this.apiRegistry.parameterHelp(method.toUpperCase(), apiPath);
    const seen = new Set();
    const entries = parameters.reduce((result, parameter) => {
      if (seen.has(parameter.name)) return result;
      seen.add(parameter.name);
      const description = String(parameter.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/(?<=[.!?])\s+/)[0];
      const operator = method === 'get' || parameter.in === 'query' ? '==' : '=';
      result.push({ name: `${parameter.name}${operator}`, description });
      return result;
    }, []);
    return entries.sort((left, right) => left.name.localeCompare(right.name));
  }

  completeVariableExpression(source) {
    const properties = (value) => Object.getOwnPropertyNames(value)
      .filter((key) => key !== 'recorder');
    const bracketMatch = source.match(/^(.*)\[(?:(["'])([^"']*)?)?$/);
    if (bracketMatch) {
      const [, base, quote, partial = ''] = bracketMatch;
      const value = this.resolveVariableExpression(base);
      if (!value || typeof value !== 'object') return null;
      const prefix = quote ? `${base}[${quote}` : `${base}["`;
      const suffix = quote || '"';
      return {
        candidates: properties(value)
          .filter((key) => key.startsWith(partial))
          .map((key) => `${prefix}${key}${suffix}]`),
        replacement: source
      };
    }

    const dotMatch = source.match(/^(.*)\.([A-Za-z_$][\w$]*)?$/);
    if (dotMatch) {
      const [, base, partial = ''] = dotMatch;
      const value = this.resolveVariableExpression(base);
      if (!value || typeof value !== 'object') return null;
      return {
        candidates: properties(value)
          .filter((key) => key.startsWith(partial))
          .map((key) => `${base}.${key}`),
        replacement: source
      };
    }

    const resolved = this.resolveVariableExpression(source);
    if (source.endsWith(']') && resolved && typeof resolved === 'object') {
      return { candidates: [`${source}[`], replacement: source };
    }
    if (/^[A-Za-z_$][\w$]*$/.test(source) &&
        resolved && typeof resolved === 'object') {
      return { candidates: [`${source}[`], replacement: source };
    }
    return null;
  }

  resolveVariableExpression(source) {
    const rootMatch = source.match(/^([A-Za-z_$][\w$]*)/);
    if (!rootMatch) return undefined;
    let value = globalThis[rootMatch[1]];
    let remaining = source.slice(rootMatch[1].length);
    while (remaining) {
      let match = remaining.match(/^\[("|')([^"']*)\1\]/);
      if (match) {
        value = value?.[match[2]];
        remaining = remaining.slice(match[0].length);
        continue;
      }
      match = remaining.match(/^\.([A-Za-z_$][\w$]*)/);
      if (match) {
        value = value?.[match[1]];
        remaining = remaining.slice(match[0].length);
        continue;
      }
      return undefined;
    }
    return value;
  }

  expandCompletionPath(pathToken) {
    return pathToken.replace(/\$([A-Za-z_$][\w$]*)/g, (match, name) => {
      const value = globalThis[name];
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      return match;
    });
  }

  async shutdown() {
    if (this.closed) return;
    this.closed = true;
    this.input.off('data', this._onData);
    this.input.off('end', this._onEnd);
    this.repl.close();
    if (globalThis.$ && globalThis.$.name === '') delete globalThis.$;
    if (this.standalone) {
      this.input.pause?.();
      process.exitCode = 0;
    }
  }
}

function createBackend(options) {
  return new Backend(options);
}

if (require.main === module) createBackend({ standalone: true });

module.exports = { Backend, createBackend };
