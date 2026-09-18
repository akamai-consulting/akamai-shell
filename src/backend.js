'use strict';

const repl = require('node:repl');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const apiRegistry = require('./api-registry');

const DEFAULT_TIMEOUT = 1000;

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
    target,
    parameterDefaults: { ...parameters },
    ...(options.settings || {})
  };
  return settings;
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
  if (!['get', 'post', 'put', 'show', 'set', 'help', 'exit', 'quit'].includes(command)) return null;
  if (command === 'help' || command === 'exit' || command === 'quit') {
    if (tokens.length) throw new Error(`${command} does not accept arguments`);
    return { command };
  }
  if (command === 'show') return { command, name: tokens.join(' ') };
  if (command === 'set') {
    if (tokens.length < 2) throw new Error('Usage: set <name> <value>');
    return { command, name: tokens.shift(), value: tokens.join(' ') };
  }
  if (!tokens.length || !tokens[0].startsWith('/')) throw new Error(`Usage: ${command} <api-path>`);
  const apiPath = tokens.shift();
  const query = {};
  const body = {};
  for (const token of tokens) {
    const match = token.match(/^([^:=]+)(:=|=)(.*)$/);
    if (!match) throw new Error(`Invalid ${command} argument "${token}"`);
    const [, name, operator, value] = match;
    if (command === 'get') query[name] = value;
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
    this.settings = loadSettings(options);
    this.requestGet = options.requestGet;
    this.apiRegistry = options.apiRegistry || apiRegistry;
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
    try {
      let result;
      switch (request.type) {
        case 'initialize':
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
    const capture = this.captureOutput();
    try {
      const value = await new Promise((resolve, reject) => {
        let settled = false;
        const duration = Number.isFinite(timeout) ? timeout : this.timeout;
        const previousError = this.repl.lastError;
        this.repl.lastError = undefined;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('Evaluation timed out'));
        }, duration);
        this.repl.eval(`${code}\n`, this.repl.context, __filename, (error, result) => {
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
    const parsed = parseCommand(source);
    if (!parsed) return (await this.evaluate(source)).value;
    if (parsed.command === 'help') {
      return 'get <api-path> [query]\npost|put <api-path> [name=value|name:=json]\nset <name> <value>\nshow\nhelp\nexit';
    }
    if (parsed.command === 'exit' || parsed.command === 'quit') return { exited: true };
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
      globalThis[name] = value;
      return { [parsed.name]: value };
    }
    if (parsed.command === 'show') {
      const visible = {
        edgerc: this.settings.edgerc,
        edgercSection: this.settings.edgercSection,
        accountSwitchKey: this.settings.accountSwitchKey,
        contractId: this.settings.contractId,
        groupId: this.settings.groupId
      };
      if (parsed.name) return visible[parsed.name] ?? globalThis[parsed.name];
      return visible;
    }
    const method = parsed.command.toUpperCase();
    const response = method === 'GET'
      ? await this.apiRegistry.get(this.settings, parsed.apiPath, parsed.query, this.requestGet)
      : await this.apiRegistry.dispatch(method, this.settings, parsed.apiPath, parsed.query, parsed.body, this.requestGet);
    return response.body;
  }

  complete(code, cursor) {
    return new Promise((resolve, reject) => {
      const position = Number.isInteger(cursor) ? cursor : code.length;
      const callback = (error, result) => {
        if (error) reject(error);
        else resolve({ candidates: result[0], replacement: result[1] });
      };
      // Node's public REPL completer currently accepts (line, callback);
      // retain cursor handling for custom REPL implementations.
      if (this.repl.completer.length >= 3) this.repl.completer(code, position, callback);
      else this.repl.completer(code.slice(0, position), callback);
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
