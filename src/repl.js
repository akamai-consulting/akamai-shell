'use strict';

const readline = require('readline');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const vm = require('vm');
const { get: papiGet } = require('./papi-client');
const apiRegistry = require('./api-registry');
const { sortCandidates } = require('./path-completion');
const { createLogger, LEVELS } = require('./logger');
const { createRecorder } = require('./recorder');

const SETTING_NAMES = [
  'edgerc',
  'edgerc-section',
  'account-switch-key',
  'contract-id',
  'group-id',
  'log-level',
  'log-output'
];
const HISTORY_SIZE = 1000;
const HISTORY_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'history');
const ENV_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'env');
const QUERY_PARAMETER_NAMES = new Set(apiRegistry.queryParameters());
const QUERY_PARAMETER_CANDIDATES = [...QUERY_PARAMETER_NAMES].sort().map((name) => `${name}==`);
const COMMANDS = [
  'get', 'post', 'put', 'set', 'unset', 'save', 'load', 'show', 'history',
  'echo', 'record', 'help', '?', 'exit', 'quit'
];

function settingCandidates(token = '') {
  return sortCandidates(SETTING_NAMES.filter((name) => name.startsWith(token)));
}

function parameterType(parameter) {
  const schema = parameter.schema || {};
  if (Array.isArray(schema.enum)) return `enum (${schema.enum.join(', ')})`;
  return schema.type || 'value';
}

function parameterDescription(parameter) {
  return parameter.description || 'No description documented.';
}

function formatParameterHelp(method, apiPath, parameters, parameterName, assignment = '==') {
  if (!parameters.length) return '';
  if (parameterName) {
    const parameter = parameters[0];
    const required = parameter.required ? 'required' : 'optional';
    const schema = parameter.schema || {};
    const exampleValue = schema.example !== undefined
      ? schema.example
      : parameter.example !== undefined ? parameter.example : `<${schema.type || 'value'}>`;
    const renderedExample = typeof exampleValue === 'string' && exampleValue.startsWith('{{')
      ? `<${schema.type || 'value'}>`
      : assignment === ':=' ? JSON.stringify(exampleValue) : String(exampleValue);
    const details = [
      `Parameter: ${parameter.name}`,
      `Description: ${parameterDescription(parameter)}`,
      `Type: ${parameterType(parameter)}`,
      `Status: ${required}`
    ];
    if (schema.default !== undefined) details.push(`Default: ${JSON.stringify(schema.default)}`);
    if (schema.example !== undefined) details.push(`Example value: ${JSON.stringify(schema.example)}`);
    details.push(`Usage: ${method.toLowerCase()} ${apiPath} ${parameter.name}${assignment}${renderedExample}`);
    return details.join('\n');
  }

  const lines = [`Parameters for ${method.toUpperCase()} ${apiPath}:`];
  for (const parameter of parameters) {
    const required = parameter.required ? 'required' : 'optional';
    lines.push(`- ${parameter.name} (${required}, ${parameterType(parameter)}): ${parameterDescription(parameter)}`);
  }
  return lines.join('\n');
}

function addCompletionSeparator([candidates, partial], variables) {
  if (candidates.length !== 1) return [candidates, partial];
  const candidate = candidates[0];
  const currentToken = partial.match(/\S*$/)?.[0] || '';
  if (candidate === currentToken) return [candidates, partial];
  if (apiRegistry.API_MODULES.some((apiModule) => apiModule.prefix === candidate)) {
    return [candidates, partial];
  }
  if (apiRegistry.hasCompletionDescendants(candidate)) {
    return [candidates, partial];
  }
  if (candidate.endsWith('/') || candidate.endsWith('==') ||
      candidate.endsWith(':=') || /\s$/.test(candidate)) {
    return [candidates, partial];
  }
  if (variables) {
    try {
      const value = vm.runInNewContext(candidate, variables);
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        return [candidates, partial];
      }
    } catch {
      // Non-JavaScript completion candidates use the normal separator rules.
    }
  }
  return [[`${candidate} `], partial];
}

const HELP = `Commands:
  get <api-path>[?query=value]  Perform a read-only GET request
      name==value ...            HTTPie-style query parameters
  post [-f <path>] <api-path> [body args]
                                Perform a POST request with a JSON body
  put [-f <path>] <api-path> [body args]
                                Perform a PUT request with a JSON body
  post|put -v <expression> <api-path>
                                Evaluate a JavaScript JSON body expression
  get [-f <path>] <api-path>   Write the GET response to a file
      name=value                 String JSON field
      name:=value                JSON-typed field (number, boolean, object, array, or null)
  set edgerc <path>             Set the EdgeGrid resource file
  set edgerc-section <name>     Set the EdgeGrid credential section
  set account-switch-key <key>  Set the target account switch key
  set contract-id <id>          Set the default contract ID
  set group-id <id>             Set the default group ID
  set log-level <level>       Set session logging (debug, info, warn, error)
  set log-output <destination> Set logging destination (stderr, stdout, or file)
  set <name> <value>            Set a custom shell variable
  set                            Show settings and custom variables
  unset <name>                   Clear a setting or variable
  unset -a                       Clear all API parameter defaults
  save [-f <path>]               Save parameter defaults
  load [-f <path>]               Load parameter defaults
  echo <text>                    Print text with variable expansion
  ! <shell command>              Run a local shell command
  history                        Show command history
  show                           Show non-secret settings
  help                           Show this help
  ?                              Alias for help
  record auto|on|off             Capture HTTP requests as JSONL
  record show [--http]           Display captured request records
  exit                           Exit the shell`;

function expandHome(value) {
  return value === '~' ? os.homedir() : value.startsWith('~/')
    ? `${os.homedir()}${value.slice(1)}`
    : value;
}

function optionPath(tokens) {
  if (!tokens.length) return ENV_FILE;
  if (tokens.length === 2 && tokens[0] === '-f') return expandHome(tokens[1]);
  throw new Error('Usage: save|load [-f <path>]');
}

function parseQuery(apiPath) {
  const url = new URL(apiPath, 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());
  return { path: url.pathname, query };
}

function tokenize(line) {
  const tokens = [];
  let token = '';
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        token += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
    } else {
      token += character;
    }
  }
  if (quote) throw new Error('Unterminated quoted value');
  if (token) tokens.push(token);
  return tokens;
}

function parseGetArguments(tokens) {
  if (!tokens.length) throw new Error('Usage: get <api-path> [name==value ...]');
  const request = parseQuery(tokens.shift());
  for (const argument of tokens) {
    const separator = argument.indexOf('==');
    if (separator < 1) throw new Error(`Invalid query parameter "${argument}". Use name==value`);
    const name = argument.slice(0, separator);
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`Invalid query parameter name "${name}"`);
    const value = argument.slice(separator + 2);
    request.query[name] = value;
  }
  return request;
}

function extractFileOption(tokens, method) {
  const remaining = [];
  let filePath;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== '-f') {
      remaining.push(tokens[index]);
      continue;
    }
    if (filePath !== undefined || tokens[index + 1] === undefined) {
      throw new Error(`Usage: ${method.toLowerCase()} [-f <path>] <api-path>`);
    }
    filePath = expandHome(tokens[index + 1]);
    index += 1;
  }
  return { remaining, filePath };
}

function parseWriteArguments(tokens, method = 'POST') {
  if (!tokens.length) throw new Error(`Usage: ${method.toLowerCase()} <api-path> [name=value ...]`);
  const request = parseQuery(tokens.shift());
  const body = {};
  let bodyArgumentCount = 0;
  for (const argument of tokens) {
    const firstEquals = argument.indexOf('=');
    const querySeparator = firstEquals > 0 && argument[firstEquals + 1] === '='
      ? firstEquals : -1;
    if (querySeparator > 0) {
      const name = argument.slice(0, querySeparator);
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
        throw new Error(`Invalid query parameter name "${name}"`);
      }
      request.query[name] = argument.slice(querySeparator + 2);
      continue;
    }

    const jsonSeparator = argument.indexOf(':=');
    const stringSeparator = firstEquals;
    const separator = jsonSeparator > 0 ? jsonSeparator : stringSeparator;
    if (separator < 1) {
      throw new Error(`Invalid body argument "${argument}". Use name=value or name:=value`);
    }
    const name = argument.slice(0, separator);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid body field name "${name}"`);
    }
    const value = argument.slice(separator + (jsonSeparator > 0 ? 2 : 1));
    if (jsonSeparator > 0) {
      try {
        body[name] = JSON.parse(value);
      } catch (error) {
        throw new Error(`Invalid JSON body value for "${name}": ${error.message}`);
      }
    } else {
      body[name] = value;
    }
    bodyArgumentCount += 1;
  }
  if (!bodyArgumentCount) {
    throw new Error(`${method.toUpperCase()} requires at least one body argument`);
  }
  return { ...request, body };
}

async function evaluateJavaScript(expression, variables, requireValue = true, expressionMode = false) {
  const sourceExpression = expression.replace(/\$\s*\(/g, 'await $(');
  const source = expressionMode
    ? `(async () => (${sourceExpression}))()`
    : `(async () => { ${sourceExpression}\n})()`;
  const value = await vm.runInNewContext(source, variables);
  if (value === undefined && !requireValue) return value;
  if (value === undefined) throw new Error('JavaScript expression must produce a JSON value');
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('value is undefined');
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error(`JavaScript value is not JSON-serializable: ${error.message}`, { cause: error });
  }
}

function serializeVariable(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? '' : serialized;
}

function expandVariables(value, variables) {
  return value.replace(
    /\$([A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\]]+)\]))*)/g,
    (match, expression) => {
      const variable = expression.match(/^[A-Za-z_$][\w$]*/)[0];
      if (!Object.prototype.hasOwnProperty.call(variables, variable)) return '';
      try {
        return serializeVariable(vm.runInNewContext(expression, variables));
      } catch {
        return match;
      }
    }
  );
}

function isJavaScriptStatement(line) {
  return /^\s*(?:[A-Za-z_$][\w$]*\s*(?:=|[[(])|delete\s+)/.test(line);
}

function isJavaScriptExpression(line) {
  return !/^\s*(?:for|while|if|switch|try|function|class|const|let|var)\b/.test(line);
}

function extractValueOption(tokens, method) {
  const remaining = [];
  let expression;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] !== '-v') {
      remaining.push(tokens[index]);
      continue;
    }
    if (expression !== undefined || tokens[index + 1] === undefined) {
      throw new Error(`Usage: ${method.toLowerCase()} [-v <expression>] <api-path>`);
    }
    expression = tokens[index + 1];
    index += 1;
  }
  return { remaining, expression };
}

function completeVariableProperties(line, variables) {
  const match = line.match(/^(.*)\[([^\]]*)$/);
  const base = match ? match[1] : line;
  const keyPartial = match ? match[2] : '';
  if (!/^(?:[A-Za-z_$][\w$]*|\S+\])(?:\[[^\]]+\])*$/.test(base)) return null;
  const root = base.match(/^[A-Za-z_$][\w$]*/)?.[0];
  if (!root || !Object.prototype.hasOwnProperty.call(variables, root)) return null;
  let value;
  try {
    value = vm.runInNewContext(base, variables);
  } catch {
    return [[], line];
  }
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return [[], line];
  }
  const partial = keyPartial.replace(/^['"]/, '');
  const candidatePrefix = match ? `${base}[` : `${base}[`;
  const keys = Object.keys(value)
    .filter((key) => !Array.isArray(value) || /^\d+$/.test(key))
    .filter((key) => key.startsWith(partial))
    .map((key) => `${candidatePrefix}${Array.isArray(value) ? key : JSON.stringify(key)}]`);
  return [sortCandidates(keys), line];
}

function splitPipeline(line) {
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if ((character === '"' || character === "'") && (!index || line[index - 1] !== '\\')) {
      quote = quote === character ? '' : quote || character;
    } else if (character === '|' && !quote) {
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }
  }
  return [line.trim(), null];
}

function bodyText(body) {
  return typeof body === 'string' ? body : JSON.stringify(body, null, 2);
}

function formatHistory(history) {
  return history
    .slice()
    .reverse()
    .map((command, index) => `${index + 1}  ${command}`)
    .join('\n');
}

function findHistoryMatch(history, term, start = 0) {
  for (let index = start; index < history.length; index += 1) {
    if (history[index].includes(term)) {
      return { command: history[index], index };
    }
  }
  return null;
}

function loadHistory(filePath = HISTORY_FILE) {
  try {
    const entries = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    return entries.slice(-HISTORY_SIZE).reverse();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Unable to load history file ${filePath}: ${error.message}`, { cause: error });
  }
}

function saveHistory(filePath, history) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const contents = history.slice().reverse().join('\n');
  fs.writeFileSync(temporaryPath, contents ? `${contents}\n` : '', { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function loadParameterDefaults(filePath = ENV_FILE) {
  try {
    const defaults = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!defaults || Array.isArray(defaults) || typeof defaults !== 'object') {
      throw new Error('parameter file must contain a JSON object');
    }
    return defaults;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Unable to load parameter file ${filePath}: ${error.message}`, { cause: error });
  }
}

function saveParameterDefaults(filePath, defaults) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(defaults, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function loadEnvironment(filePath) {
  const contents = loadParameterDefaults(filePath);
  if (!Object.keys(contents).length) {
    return { parameters: {}, variables: {} };
  }
  if (!contents.parameters || typeof contents.parameters !== 'object' ||
      Array.isArray(contents.parameters) ||
      !contents.variables || typeof contents.variables !== 'object' ||
      Array.isArray(contents.variables)) {
    throw new Error(`Environment file ${filePath} must contain parameters and variables objects`);
  }
  return contents;
}

function saveEnvironment(filePath, parameters, variables) {
  saveParameterDefaults(filePath, { parameters, variables });
}

function runShellCommand(command, input, output) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk) => output.write(chunk));
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE' && !settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        settled = true;
        const suffix = signal ? ` (signal ${signal})` : '';
        reject(new Error(`Pipeline command failed with exit code ${code}${suffix}${stderr ? `: ${stderr.trim()}` : ''}`));
        return;
      }
      settled = true;
      resolve();
    });
    child.stdin.end(input);
  });
}

function createRepl(output = process.stdout, input = process.stdin, requestGet, historyFile = HISTORY_FILE) {
  const parameterFile = historyFile === HISTORY_FILE ? ENV_FILE : path.join(path.dirname(historyFile), 'env');
  const environment = loadEnvironment(parameterFile);
  const parameterDefaults = environment.parameters;
  const settings = {
    edgerc: parameterDefaults.edgerc || `${os.homedir()}/.edgerc`,
    edgercSection: parameterDefaults.edgercSection || 'default',
    accountSwitchKey: '',
    contractId: '',
    groupId: '',
    logLevel: 'info',
    logOutput: 'stderr',
    recordMode: 'off',
    parameterDefaults
  };
  Object.defineProperty(settings, 'logger', {
    value: createLogger(),
    enumerable: false,
    writable: false
  });
  settings.accountSwitchKey = settings.parameterDefaults.accountSwitchKey || '';
  settings.contractId = settings.parameterDefaults.contractId || '';
  settings.groupId = settings.parameterDefaults.groupId || '';
  const variables = { ...environment.variables };
  const writeConsole = (...values) => {
    output.write(`${values.map((value) => typeof value === 'string'
      ? value
      : serializeVariable(value)).join(' ')}\n`);
  };
  Object.defineProperty(variables, 'console', {
    value: {
      log: writeConsole,
      info: writeConsole,
      warn: writeConsole,
      error: writeConsole
    },
    enumerable: false
  });
  Object.defineProperty(variables, '$', {
    value: async (command) => {
      const tokens = tokenize(expandVariables(command, variables));
      const method = tokens.shift()?.toLowerCase();
      if (method !== 'get') {
        throw new Error('JavaScript $() currently supports only the get command');
      }
      const request = parseGetArguments(tokens);
      const response = await apiRegistry.get(settings, request.path, request.query, requestGet);
      return response.body;
    },
    enumerable: false
  });
  const cache = new Map();
  let rl;
  const recorder = createRecorder();
  Object.defineProperty(settings, 'recorder', {
    value: recorder,
    enumerable: false,
    writable: false
  });

  function persistHistory() {
    try {
      saveHistory(historyFile, rl.history);
    } catch (error) {
      output.write(`Error: ${error.message}\n`);
    }
  }

  function persistParameters() {
    try {
      saveEnvironment(parameterFile, settings.parameterDefaults, variables);
    } catch (error) {
      output.write(`Error: ${error.message}\n`);
    }
  }

  function applyParameterDefaults(defaults) {
    settings.parameterDefaults = defaults;
    settings.edgerc = defaults.edgerc || `${os.homedir()}/.edgerc`;
    settings.edgercSection = defaults.edgercSection || 'default';
    settings.accountSwitchKey = defaults.accountSwitchKey || '';
    settings.contractId = defaults.contractId || '';
    settings.groupId = defaults.groupId || '';
  }

  async function execute(line) {
    const executeJavaScript = async (source) => {
      const value = await evaluateJavaScript(source, variables, false, isJavaScriptExpression(source));
      if (value !== undefined) output.write(`${JSON.stringify(value)}\n`);
    };
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('!')) {
      const shellCommand = trimmedLine.slice(1).trim();
      if (!shellCommand) throw new Error('Usage: ! <shell command>');
      await runShellCommand(shellCommand, '', output);
      return true;
    }
    if (isJavaScriptStatement(line)) {
      await executeJavaScript(line);
      return true;
    }
    const expandedLine = expandVariables(line, variables);
    const [commandLine, pipeline] = splitPipeline(expandedLine);
    const tokens = tokenize(commandLine);
    if (!tokens.length) return true;
    const command = tokens.shift().toLowerCase();
    settings.logger.debug('Command received', { command });
    if (pipeline !== null && command !== 'get') {
      throw new Error('Pipelines are supported only after get commands; post and put do not support pipelines');
    }

    if (command === 'exit' || command === 'quit') return false;
    if (command === 'help' || command === '?') {
      output.write(`${HELP}\n`);
      return true;
    }
    if (command === 'show') {
      output.write(`${JSON.stringify(settings, null, 2)}\n`);
      return true;
    }
    if (command === 'echo') {
      output.write(`${expandVariables(commandLine.slice(command.length).trim(), variables)}\n`);
      return true;
    }
    if (command === 'history') {
      const history = formatHistory(rl.history);
      if (history) output.write(`${history}\n`);
      return true;
    }
    if (command === 'record') {
      const action = tokens.shift();
      if (action === 'show') {
        if (tokens.length > 1 || (tokens.length === 1 && tokens[0] !== '--http')) {
          throw new Error('Usage: record show [--http]');
        }
        const content = tokens[0] === '--http' ? recorder.http() : recorder.jsonl();
        if (content) output.write(`${content}\n`);
        return true;
      }
      if (tokens.length || !['auto', 'on', 'off'].includes(action)) {
        throw new Error('Usage: record (auto|on|off) or record show [--http]');
      }
      recorder.setMode(action);
      settings.recordMode = action;
      return true;
    }
    if (command === 'save' || command === 'load') {
      const filePath = optionPath(tokens);
      if (command === 'save') {
        saveEnvironment(filePath, settings.parameterDefaults, variables);
      } else {
        const loaded = loadEnvironment(filePath);
        applyParameterDefaults(loaded.parameters);
        Object.keys(variables).forEach((name) => delete variables[name]);
        Object.assign(variables, loaded.variables);
        cache.clear();
      }
      return true;
    }
    if (command === 'unset') {
      if (tokens.length === 1 && tokens[0] === '-a') {
        applyParameterDefaults({});
        cache.clear();
        return true;
      }
      if (tokens.length !== 1) {
        throw new Error(`Usage: unset ${SETTING_NAMES.join('|')}|<variable>`);
      }
      const setting = tokens[0];
      if (setting === 'log-level') {
        settings.logLevel = 'info';
        settings.logger.setLevel('info');
        cache.clear();
        return true;
      }
      if (setting === 'log-output') {
        settings.logOutput = 'stderr';
        settings.logger.setOutput('stderr');
        cache.clear();
        return true;
      }
      if (SETTING_NAMES.includes(setting)) {
        const key = setting === 'edgerc-section' ? 'edgercSection'
          : setting === 'account-switch-key' ? 'accountSwitchKey'
            : setting === 'contract-id' ? 'contractId'
              : setting === 'group-id' ? 'groupId' : 'edgerc';
        settings[key] = ['accountSwitchKey', 'contractId', 'groupId'].includes(key) ? '' : undefined;
        delete settings.parameterDefaults[key];
      } else {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(setting)) throw new Error('Invalid variable name');
        delete variables[setting];
      }
      cache.clear();
      return true;
    }
    if (command === 'set') {
      if (!tokens.length) {
        output.write(`${JSON.stringify({ ...settings, ...variables }, null, 2)}\n`);
        return true;
      }
      if (tokens.length < 2) {
        throw new Error(`Usage: set ${SETTING_NAMES.join('|')} <value> or set <variable> <value>`);
      }
      const name = tokens[0];
      const value = tokens.slice(1).join(' ');
      if (name === 'log-level') {
        settings.logLevel = LEVELS.includes(value) ? value : 'info';
        settings.logger.setLevel(settings.logLevel);
        settings.logger.info('Log level changed', { level: settings.logLevel });
        return true;
      }
      if (name === 'log-output') {
        const destination = value === 'stderr' || value === 'stdout' ? value : expandHome(value);
        settings.logger.setOutput(destination);
        settings.logOutput = destination;
        settings.logger.info('Log output changed', { destination });
        return true;
      }
      if (SETTING_NAMES.includes(name)) {
        const key = name === 'edgerc-section' ? 'edgercSection'
          : name === 'account-switch-key' ? 'accountSwitchKey'
            : name === 'contract-id' ? 'contractId'
              : name === 'group-id' ? 'groupId' : 'edgerc';
        settings[key] = key === 'edgerc' ? expandHome(value) : value;
      } else if (QUERY_PARAMETER_NAMES.has(name)) {
        settings.parameterDefaults[name] = value;
        if (name === 'accountSwitchKey') settings.accountSwitchKey = value;
        if (name === 'contractId') settings.contractId = value;
        if (name === 'groupId') settings.groupId = value;
      } else {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid variable name');
        variables[name] = value;
      }
      if (SETTING_NAMES.includes(name) && ['edgerc', 'edgercSection', 'accountSwitchKey', 'contractId', 'groupId'].includes(
        name === 'edgerc' ? 'edgerc'
          : name === 'account-switch-key' ? 'accountSwitchKey'
          : name === 'contract-id' ? 'contractId'
            : name === 'group-id' ? 'groupId'
              : name === 'edgerc-section' ? 'edgercSection' : ''
      )) {
        const parameterName = name === 'edgerc' ? 'edgerc'
          : name === 'account-switch-key' ? 'accountSwitchKey'
          : name === 'contract-id' ? 'contractId'
            : name === 'group-id' ? 'groupId' : 'edgercSection';
        settings.parameterDefaults[parameterName] = value;
      }
      persistParameters();
      cache.clear();
      return true;
    }
    if (command !== 'get' && command !== 'post' && command !== 'put') {
      await executeJavaScript(commandLine);
      return true;
    }

    const fileOption = extractFileOption(tokens, command);
    const valueOption = command === 'get'
      ? { remaining: fileOption.remaining, expression: undefined }
      : extractValueOption(fileOption.remaining, command);
    const requestTokens = command === 'get'
      ? valueOption.remaining
      : valueOption.remaining;
    const request = command === 'get'
      ? parseGetArguments(requestTokens)
      : fileOption.filePath === undefined && valueOption.expression === undefined
        ? parseWriteArguments(requestTokens, command.toUpperCase())
        : parseGetArguments(requestTokens);
    if (command !== 'get' && fileOption.filePath !== undefined) {
      try {
        request.body = JSON.parse(fs.readFileSync(fileOption.filePath, 'utf8'));
      } catch (error) {
        throw new Error(`Unable to read JSON body file ${fileOption.filePath}: ${error.message}`, {
          cause: error
        });
      }
    }
    if (command !== 'get' && valueOption.expression !== undefined) {
      if (fileOption.filePath !== undefined) {
        throw new Error('The -v option cannot be combined with -f');
      }
      request.body = await evaluateJavaScript(valueOption.expression, variables, true, true);
    }
    const response = command === 'get'
      ? await apiRegistry.get(settings, request.path, request.query, requestGet)
      : await apiRegistry.dispatch(command.toUpperCase(), settings, request.path,
        request.query, request.body, requestGet);
    const outputBody = bodyText(response.body);
    if (command === 'get' && fileOption.filePath !== undefined) {
      if (pipeline !== null) {
        throw new Error('GET file output cannot be combined with a pipeline');
      }
      fs.writeFileSync(fileOption.filePath, `${outputBody}\n`, { mode: 0o600 });
      return true;
    }
    if (pipeline !== null) {
      if (!pipeline) throw new Error('Pipeline command cannot be empty');
      await runShellCommand(pipeline, `${outputBody}\n`, output);
    } else {
      output.write(`${outputBody}\n`);
    }
    return true;
  }

  async function complete(line) {
    const variableCompletion = completeVariableProperties(line, variables);
    if (variableCompletion) return variableCompletion;
    if (/^\S*$/.test(line)) {
      return [sortCandidates(COMMANDS.filter((command) => command.startsWith(line))), line];
    }
    const recordMatch = line.match(/^record\s+(\S*)$/);
    if (recordMatch) {
      const partial = recordMatch[1];
      return [sortCandidates(['auto', 'off', 'on', 'show'].filter((value) =>
        value.startsWith(partial))), partial];
    }
    const logLevelMatch = line.match(/^set\s+log-level\s+(\S*)$/);
    if (logLevelMatch) {
      const partial = logLevelMatch[1];
      return [LEVELS.filter((level) => level.startsWith(partial)), partial];
    }
    const logOutputMatch = line.match(/^set\s+log-output\s+(\S*)$/);
    if (logOutputMatch) {
      const partial = logOutputMatch[1];
      return [['stderr', 'stdout'].filter((destination) => destination.startsWith(partial)), partial];
    }
    if (/^set\s*$/.test(line)) {
      return [sortCandidates(SETTING_NAMES), ''];
    }
    const contextMatch = line.match(/^set\s+(contract-id|group-id)\s+(\S*)$/);
    if (contextMatch) {
      const setting = contextMatch[1];
      const partial = contextMatch[2];
      return apiRegistry.completeSetting(setting, partial, settings, cache, requestGet || papiGet);
    }
    const setMatch = line.match(/^set\s+(\S*)$/);
    if (setMatch) {
      const token = setMatch[1];
      return [settingCandidates(token), token];
    }
    const optionMatch = line.match(/^(get|post|put)\s+(-\S*)$/);
    if (optionMatch) {
      const token = optionMatch[2];
      return [sortCandidates(['-f'].filter((option) => option.startsWith(token))), token];
    }
    const queryMatch = line.match(/^(get|post|put)\s+\S+\s+(\S*)$/);
    if (queryMatch) {
      const token = queryMatch[2];
      return [sortCandidates(QUERY_PARAMETER_CANDIDATES.filter((candidate) => candidate.startsWith(token))), token];
    }
    const match = line.match(/^(get|post|put)\s+(\S*)$/);
    if (!match) return [[], line];
    const inputPath = match[2] || '/';
    const result = await apiRegistry.completeMethod(
      match[1].toUpperCase(), inputPath, settings, cache, requestGet
    );
    return result;
  }

  async function showParameterHelp(line) {
    const match = line.match(/^(get|post|put)\s+(\S+)\s+(\S*)$/) ||
      line.match(/^(get|post|put)\s+(\S+)\?$/);
    if (!match) return false;
    const [, method, apiPath, token = '?'] = match;
    if (!token.endsWith('?')) return false;
    const helpToken = token.slice(0, -1);
    const parameterName = helpToken === '' ? undefined : helpToken.replace(/(?:==|:=)$/, '');
    const assignment = helpToken.endsWith(':=') ? ':=' : '==';
    if (helpToken !== '' && !/^[A-Za-z0-9_-]+(?:==|:=)?$/.test(helpToken)) return false;
    const parameters = apiRegistry.parameterHelp(method.toUpperCase(), apiPath, parameterName);
    const help = formatParameterHelp(method, apiPath, parameters, parameterName, assignment);
    if (!help) return false;
    output.write(`\n${help}\n`);
    rl._refreshLine();
    return true;
  }

  rl = readline.createInterface({
    input,
    output,
    prompt: 'prompt> ',
    history: loadHistory(),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
    completer(line, callback) {
      complete(line).then((result) => {
        callback(null, addCompletionSeparator(result, variables));
      }, (error) => callback(error));
    }
  });
  if (input.isTTY && output.isTTY) {
    const ttyWrite = rl._ttyWrite.bind(rl);
    let searchTerm = null;
    let searchStart = 0;
    let searchLine = '';
    let searchCursor = 0;

    function refreshSearch(match) {
      const result = match ? match.command : '';
      const suffix = match ? `': ${result}` : "': ";
      rl.output.write(`\r\x1b[2K(reverse-i-search)\`${searchTerm}${suffix}`);
    }

    function updateSearch() {
      const match = findHistoryMatch(rl.history, searchTerm, searchStart);
      if (match) {
        rl.line = match.command;
        rl.cursor = rl.line.length;
        searchStart = match.index;
      } else {
        rl.output.write('\x07');
      }
      refreshSearch(match);
    }

    function finishSearch(cancelled) {
      if (cancelled) {
        rl.line = searchLine;
        rl.cursor = searchCursor;
      }
      searchTerm = null;
      searchStart = 0;
      rl._refreshLine();
    }

    rl._ttyWrite = (character, key) => {
      if (searchTerm !== null) {
        if (key && key.ctrl && key.name === 'r') {
          searchStart += 1;
          updateSearch();
          return;
        }
        if (key && (key.name === 'return' || key.name === 'enter')) {
          finishSearch(false);
          return;
        }
        if (key && key.name === 'escape') {
          finishSearch(true);
          return;
        }
        if (key && key.ctrl && key.name === 'g') {
          finishSearch(true);
          return;
        }
        if (key && key.name === 'backspace') {
          if (searchTerm) {
            searchTerm = searchTerm.slice(0, -1);
            searchStart = 0;
            updateSearch();
          }
          return;
        }
        if (character && !key?.ctrl && !key?.meta && character >= ' ') {
          searchTerm += character;
          searchStart = 0;
          updateSearch();
          return;
        }
        finishSearch(false);
        if (character || key) {
          ttyWrite(character, key);
        }
        return;
      }
      if (key && key.ctrl && key.name === 'r') {
        searchLine = rl.line;
        searchCursor = rl.cursor;
        searchTerm = rl.line;
        searchStart = 0;
        updateSearch();
        return;
      }
      const isQuestionMark = character === '?' || key?.name === '?' || key?.sequence === '?';
      if (isQuestionMark && !key?.ctrl && !key?.meta) {
        const line = `${rl.line.slice(0, rl.cursor)}?`;
        showParameterHelp(line).then((shown) => {
          if (!shown) ttyWrite('?', key);
        }, (error) => {
          output.write(`Error: ${error.message}\n`);
          rl._refreshLine();
        });
        return;
      }
      ttyWrite(character, key);
    };
  }

  rl.on('line', (line) => {
    persistHistory();
    execute(line)
      .then((keepGoing) => {
        if (!keepGoing) {
          rl.close();
        } else if (!rl.closed) {
          rl.prompt();
        }
      })
      .catch((error) => {
        settings.logger.warn('Command failed', { message: error.message, statusCode: error.statusCode });
        const status = error.statusCode ? ` (HTTP ${error.statusCode})` : '';
        const details = error.body ? `: ${typeof error.body === 'string' ? error.body : JSON.stringify(error.body)}` : '';
        output.write(`Error${status}: ${error.message}${details}\n`);
        if (!rl.closed) rl.prompt();
      });
  });

  rl.on('close', () => {
    persistHistory();
    if (input.isTTY) output.write('\n');
  });
  rl.prompt();
  return { rl, settings, variables, execute, complete };
}

module.exports = {
  createRepl,
  parseQuery,
  parseGetArguments,
  parseWriteArguments,
  QUERY_PARAMETER_CANDIDATES,
  COMMANDS,
  tokenize,
  splitPipeline,
  runShellCommand,
  formatHistory,
  findHistoryMatch,
  loadHistory,
  saveHistory,
  loadParameterDefaults,
  saveParameterDefaults,
  SETTING_NAMES,
  settingCandidates,
  formatParameterHelp,
  addCompletionSeparator,
  contextCandidates: apiRegistry.API_MODULES.find((apiModule) =>
    apiModule.contextCandidates)?.contextCandidates
};
