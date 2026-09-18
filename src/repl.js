'use strict';

const readline = require('readline');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const vm = require('vm');
const apiRegistry = require('./api-registry');
const { sortCandidates } = require('./path-completion');
const { createLogger, LEVELS } = require('./logger');
const { createRecorder } = require('./recorder');
const { findResources } = require('./find');

const HISTORY_SIZE = 1000;
const HISTORY_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'history');
const ENV_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'env');
const QUERY_PARAMETER_NAMES = new Set(apiRegistry.queryParameters());
const QUERY_PARAMETER_CANDIDATES = [...QUERY_PARAMETER_NAMES].sort().map((name) => `${name}==`);
const VARIABLE_PATTERN =
  /\$([A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\]]+)\]))*)/g;
const TARGET_FIELDS = ['accountSwitchKey', 'contractId', 'groupId'];
const CONFIG_NAMES = [
  'edgerc', 'edgercSection', 'accountSwitchKey', 'target', 'contractId', 'groupId',
  'logLevel', 'logOutput', 'recordMode', 'parameterDefaults',
  ...QUERY_PARAMETER_NAMES
];
const COMMANDS = [
  'get', 'post', 'put', 'find', 'show', 'history',
  'echo', 'record', 'help', '?', 'exit', 'quit'
];

function parameterType(parameter) {
  const schema = parameter.schema || {};
  if (Array.isArray(schema.enum)) return `enum (${schema.enum.join(', ')})`;
  return schema.type || 'value';
}

function parameterDescription(parameter) {
  return parameter.description || 'No description documented.';
}

function normalizeTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('config.target must be an object');
  }
  const target = {};
  for (const field of TARGET_FIELDS) {
    if (value[field] !== undefined && value[field] !== null) {
      if (typeof value[field] !== 'string') {
        throw new Error(`config.target.${field} must be a string`);
      }
      target[field] = value[field];
    }
  }
  return target;
}

function targetFromParameters(parameters) {
  const legacyTarget = {
    accountSwitchKey: parameters.accountSwitchKey,
    contractId: parameters.contractId,
    groupId: parameters.groupId
  };
  const target = parameters.target === undefined
    ? legacyTarget
    : { accountSwitchKey: parameters.accountSwitchKey, ...parameters.target };
  const normalized = normalizeTarget(target);
  delete parameters.accountSwitchKey;
  delete parameters.contractId;
  delete parameters.groupId;
  if (Object.keys(normalized).length) parameters.target = normalized;
  else delete parameters.target;
  return normalized;
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
  if (candidate.startsWith('$')) return [candidates, partial];
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
========
Requests:
  get <api-path> [name==value ...]     GET a resource
  get -f <file> <api-path>             Save formatted GET JSON
  post <api-path> [body ...]           POST a JSON body
  put <api-path> [body ...]            PUT a JSON body
  post|put -v <expression> <api-path>  Use a JavaScript value as the body
  post|put -f <file> <api-path>        Read the JSON body from a file

  Query fields use name==value.
  Body fields use name=value (string) or name:=value (JSON).

Data and shell:
  find <api-path> -q <rule>            Find matching dictionaries in one GET
  show [<expression>]                  Show variables or one JSON value
  echo <text> [| command]              Print or pipe expanded text
  ! <shell command>                    Run a local shell command

Session:
  config.<name> = <value>              Change a session setting
  record auto|on|off                   Control HTTP recording
  record show [--http]                Display captured records
  history                              Show command history
  help, ?                              Show this help
  exit, quit                           Exit the shell

Other input is evaluated as JavaScript. Press Tab for command and API
completion.`;

function expandHome(value) {
  return value === '~' ? os.homedir() : value.startsWith('~/')
    ? `${os.homedir()}${value.slice(1)}`
    : value;
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

function parseFindArguments(tokens) {
  if (!tokens.length) throw new Error('Usage: find <api-path> [-q <query>]');
  const pathToken = tokens.shift();
  let query;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === '-q') {
      if (query !== undefined || tokens[index + 1] === undefined) {
        throw new Error('Usage: find <api-path> [-q <query>]');
      }
      query = tokens[++index];
      continue;
    }
    throw new Error('Usage: find <api-path> -q <query>');
  }
  if (query === undefined) throw new Error('Usage: find <api-path> -q <query>');
  return { path: parseQuery(pathToken).path, query };
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

async function evaluateJavaScript(expression, variables, requireValue = true, expressionMode = false,
  serialize = true) {
  for (const name of Object.keys(variables)) {
    const value = variables[name];
    if (value && typeof value.then === 'function') {
      variables[name] = await value;
    }
  }
  const sourceExpression = awaitDollarCalls(expression);
  const source = expressionMode
    ? `(async () => (${sourceExpression}))()`
    : `(async () => { ${sourceExpression}\n})()`;
  const value = await vm.runInNewContext(source, variables);
  if (value === undefined && !requireValue) return value;
  if (value === undefined) throw new Error('JavaScript expression must produce a JSON value');
  if (!serialize) return value;
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('value is undefined');
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error(`JavaScript value is not JSON-serializable: ${error.message}`, { cause: error });
  }

  function awaitDollarCalls(source) {
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
          continue;
        }
        if (innerCharacter === '"' || innerCharacter === "'" || innerCharacter === '`') {
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
}

function serializeVariable(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? '' : serialized;
}

function hasUnquotedCharacter(value, target) {
  let quote = '';
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === target) {
      return true;
    }
  }
  return false;
}

function expandVariables(value, variables) {
  return value.replace(
    VARIABLE_PATTERN,
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

function expandCompletionPath(value, variables) {
  let unresolved = false;
  const expanded = value.replace(VARIABLE_PATTERN, (match, expression) => {
    const variable = expression.match(/^[A-Za-z_$][\w$]*/)[0];
    if (!Object.prototype.hasOwnProperty.call(variables, variable)) {
      unresolved = true;
      return match;
    }
    try {
      const resolved = vm.runInNewContext(expression, variables);
      if (resolved === null || (typeof resolved !== 'string' && typeof resolved !== 'number')) {
        unresolved = true;
        return match;
      }
      return String(resolved);
    } catch {
      unresolved = true;
      return match;
    }
  });
  return unresolved ? null : expanded;
}

function expandTokenizedArguments(value, variables, rawStrings = false) {
  const replacements = new Map();
  const protectedValue = value.replace(VARIABLE_PATTERN, (match) => {
    const placeholder = `__akamai_variable_${replacements.size}__`;
    const serialized = expandVariables(match, variables);
    let replacement = serialized;
    if (rawStrings) {
      try {
        const parsed = JSON.parse(serialized);
        if (typeof parsed === 'string') replacement = parsed;
      } catch {
        // Preserve unresolved variables for the normal expansion behavior.
      }
    }
    replacements.set(placeholder, replacement);
    return placeholder;
  });
  return tokenize(protectedValue).map((token) => {
    let expanded = token;
    for (const [placeholder, replacement] of replacements) {
      expanded = expanded.replace(placeholder, replacement);
    }
    return expanded;
  });
}

function isJavaScriptStatement(line) {
  return /^\s*(?:[A-Za-z_$][\w$]*\s*(?:=|[[(])|delete\s+)/.test(line);
}

function isJavaScriptExpression(line) {
  return !hasUnquotedCharacter(line, ';') &&
    !/^\s*(?:for|while|if|switch|try|function|class|const|let|var)\b/.test(line);
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
    const pathIndex = tokens.findIndex((token, tokenIndex) =>
      tokenIndex > index + 1 && token.startsWith('/'));
    if (pathIndex >= 0) {
      expression = tokens.slice(index + 1, pathIndex).join(' ');
      remaining.push(...tokens.slice(pathIndex));
      index = tokens.length;
    } else {
      expression = tokens.slice(index + 1).join(' ');
      index = tokens.length;
    }
  }
  return { remaining, expression };
}

async function completeVariableProperties(line, variables) {
  const match = line.match(/^(.*)\[([^\]]*)$/);
  const base = match ? match[1] : line;
  const keyPartial = match ? match[2] : '';
  if (!/^(?:[A-Za-z_$][\w$]*|\S+\])(?:\[[^\]]+\])*$/.test(base)) return null;
  const root = base.match(/^[A-Za-z_$][\w$]*/)?.[0];
  if (!root || !Object.prototype.hasOwnProperty.call(variables, root)) return null;
  let value;
  try {
    value = await vm.runInNewContext(base, variables);
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

function completeVariableReference(line, variables) {
  const marker = line.lastIndexOf('$');
  if (marker < 0) return null;
  const reference = line.slice(marker);
  const match = reference.match(/^\$([A-Za-z_$][\w$]*(?:\[[^\]]*\])*(?:\[[^\]]*)?)$/);
  if (!match) return null;
  const expression = match[1];
  const root = expression.match(/^[A-Za-z_$][\w$]*/)[0];
  const partial = reference;
  if (!Object.prototype.hasOwnProperty.call(variables, root)) {
    if (expression.includes('[')) return [[], partial];
    const candidates = Object.keys(variables)
      .filter((name) => name.startsWith(expression))
      .map((name) => `$${name}`);
    return [sortCandidates(candidates), partial];
  }
  const bracket = expression.match(/^(.*)\[([^\]]*)$/);
  const valueExpression = bracket ? bracket[1] : expression;
  const value = valueExpression === root
    ? variables[root]
    : (() => {
      try {
        return vm.runInNewContext(valueExpression, variables);
      } catch {
        return undefined;
      }
    })();
  if (value === undefined || value === null ||
      (typeof value !== 'object' && typeof value !== 'function')) {
    return [[], partial];
  }
  const base = bracket ? bracket[1] : expression;
  const keyPartial = bracket ? bracket[2].replace(/^['"]/, '') : '';
  const keys = Object.keys(value)
    .filter((key) => !Array.isArray(value) || /^\d+$/.test(key))
    .filter((key) => key.startsWith(keyPartial))
    .map((key) => `$${base}[${Array.isArray(value) ? key : JSON.stringify(key)}]`);
  return [sortCandidates(keys), partial];
}

function completeVariableName(line, variables) {
  if (!/^[A-Za-z_$][\w$]*$/.test(line)) return null;
  return [sortCandidates(Object.keys(variables).filter((name) => name.startsWith(line))), line];
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

function parsePipelineOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) return output;
  try {
    return JSON.parse(trimmed);
  } catch {
    const values = [];
    let index = 0;
    while (index < trimmed.length) {
      while (/\s/.test(trimmed[index] || '')) index += 1;
      if (index >= trimmed.length) break;
      const start = index;
      const opening = trimmed[index];
      if (opening === '{' || opening === '[') {
        const stack = [opening === '{' ? '}' : ']'];
        let quote = false;
        let escaped = false;
        index += 1;
        while (index < trimmed.length && stack.length) {
          const character = trimmed[index];
          if (escaped) {
            escaped = false;
          } else if (character === '\\' && quote) {
            escaped = true;
          } else if (character === '"') {
            quote = !quote;
          } else if (!quote && (character === '{' || character === '[')) {
            stack.push(character === '{' ? '}' : ']');
          } else if (!quote && (character === '}' || character === ']')) {
            if (stack[stack.length - 1] !== character) return output;
            stack.pop();
          }
          index += 1;
        }
        if (stack.length) return output;
      } else if (opening === '"') {
        index += 1;
        let escaped = false;
        while (index < trimmed.length) {
          const character = trimmed[index++];
          if (escaped) escaped = false;
          else if (character === '\\') escaped = true;
          else if (character === '"') break;
        }
      } else {
        while (index < trimmed.length && !/\s/.test(trimmed[index])) index += 1;
      }
      try {
        values.push(JSON.parse(trimmed.slice(start, index)));
      } catch {
        return output;
      }
    }
    return values.length > 1 ? values : output;
  }
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
  const userVariables = { ...variables };
  delete userVariables.config;
  saveParameterDefaults(filePath, { parameters, variables: userVariables });
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

function runShellCommandCapture(command, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
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
      resolve(stdout);
    });
    child.stdin.end(input);
  });
}

function createRepl(output = process.stdout, input = process.stdin, requestGet, historyFile = HISTORY_FILE) {
  // A null historyFile requests an ephemeral session (used for script execution):
  // history and the parameter/variable environment are kept in memory only and
  // nothing is read from or written to disk.
  const persistent = historyFile !== null;
  const parameterFile = !persistent
    ? null
    : historyFile === HISTORY_FILE ? ENV_FILE : path.join(path.dirname(historyFile), 'env');
  const environment = parameterFile === null ? { parameters: {}, variables: {} } : loadEnvironment(parameterFile);
  const parameterDefaults = environment.parameters;
  const target = targetFromParameters(parameterDefaults);
  const settingsTarget = {
    edgerc: parameterDefaults.edgerc || `${os.homedir()}/.edgerc`,
    edgercSection: parameterDefaults.edgercSection || 'default',
    accountSwitchKey: '',
    target,
    contractId: '',
    groupId: '',
    logLevel: LEVELS.includes(parameterDefaults.logLevel) ? parameterDefaults.logLevel : 'info',
    logOutput: parameterDefaults.logOutput || 'stderr',
    recordMode: ['auto', 'on', 'off'].includes(parameterDefaults.recordMode)
      ? parameterDefaults.recordMode : 'auto',
    parameterDefaults,
    ...Object.fromEntries(Object.entries(parameterDefaults)
      .filter(([name]) => QUERY_PARAMETER_NAMES.has(name) &&
        !TARGET_FIELDS.includes(name)))
  };
  const settings = new Proxy(settingsTarget, {
    set(target, property, value) {
      if (typeof property === 'string' && !CONFIG_NAMES.includes(property)) {
        throw new Error(`Unknown config property "${property}"`);
      }
      const normalizedValue = property === 'edgerc' || property === 'logOutput'
        ? expandHome(value)
        : value;
      target[property] = normalizedValue;
      if (property === 'logLevel') {
        target[property] = LEVELS.includes(value) ? value : 'info';
        target.logger?.setLevel(target[property]);
      } else if (property === 'logOutput') {
        target.logger?.setOutput(normalizedValue);
      }
      if (property === 'target') {
        const normalizedTarget = normalizeTarget(value);
        target.target = normalizedTarget;
        for (const field of TARGET_FIELDS) target[field] = normalizedTarget[field] || '';
        target.parameterDefaults.target = normalizedTarget;
        for (const field of TARGET_FIELDS) delete target.parameterDefaults[field];
      } else if (['edgerc', 'edgercSection'].includes(property)) {
        target.parameterDefaults[property] = target[property];
      } else if (TARGET_FIELDS.includes(property)) {
        target.target = normalizeTarget({
          ...target.target,
          [property]: target[property] || undefined
        });
        if (Object.keys(target.target).length) target.parameterDefaults.target = target.target;
        else delete target.parameterDefaults.target;
        for (const field of TARGET_FIELDS) delete target.parameterDefaults[field];
      } else if (QUERY_PARAMETER_NAMES.has(property)) {
        target.parameterDefaults[property] = target[property];
      }
      if (['logLevel', 'logOutput', 'recordMode'].includes(property)) {
        target.parameterDefaults[property] = target[property];
      }
      if (property === 'recordMode') target.recorder?.setMode(target.recordMode);
      if (typeof persistParameters === 'function') persistParameters();
      return true;
    },
    deleteProperty(target, property) {
      if (typeof property === 'string' && !CONFIG_NAMES.includes(property)) {
        throw new Error(`Unknown config property "${property}"`);
      }
      if (['edgerc', 'edgercSection'].includes(property)) {
        target[property] = undefined;
        delete target.parameterDefaults[property];
        return true;
      }
      if (property === 'target' || TARGET_FIELDS.includes(property)) {
        if (property === 'target') target.target = {};
        else {
          target.target = { ...target.target };
          delete target.target[property];
        }
        for (const field of TARGET_FIELDS) target[field] = target.target[field] || '';
        if (Object.keys(target.target).length) target.parameterDefaults.target = target.target;
        else delete target.parameterDefaults.target;
        for (const field of TARGET_FIELDS) delete target.parameterDefaults[field];
        return true;
      }
      if (QUERY_PARAMETER_NAMES.has(property)) delete target.parameterDefaults[property];
      if (property === 'logLevel') target.logLevel = 'info';
      if (property === 'logOutput') target.logOutput = 'stderr';
      if (property === 'recordMode') target.recordMode = 'auto';
      if (property === 'recordMode') target.recorder?.setMode(target.recordMode);
      if (['logLevel', 'logOutput', 'recordMode'].includes(property)) {
        delete target.parameterDefaults[property];
      }
      return delete target[property];
    }
  });
  Object.defineProperty(settings, 'logger', {
    value: createLogger(),
    enumerable: false,
    writable: false
  });
  settings.logger.setLevel(settingsTarget.logLevel);
  settings.logger.setOutput(settingsTarget.logOutput);
  Object.defineProperty(settingsTarget, 'parameterDefaults', {
    value: parameterDefaults,
    enumerable: false,
    writable: true
  });
  settingsTarget.accountSwitchKey = target.accountSwitchKey || '';
  settingsTarget.contractId = target.contractId || '';
  settingsTarget.groupId = target.groupId || '';
  Object.defineProperties(settingsTarget, {
    accountSwitchKey: {
      value: settingsTarget.accountSwitchKey, writable: true, enumerable: false, configurable: true
    },
    contractId: { value: settingsTarget.contractId, writable: true, enumerable: false, configurable: true },
    groupId: { value: settingsTarget.groupId, writable: true, enumerable: false, configurable: true }
  });
  const variables = { ...environment.variables };
  delete variables.config;
  Object.defineProperty(variables, 'config', {
    value: settings,
    enumerable: true,
    writable: false
  });
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
      let captured = '';
      const commandOutput = {
        write(value) {
          captured += Buffer.isBuffer(value) ? value.toString() : String(value);
        }
      };
      const execution = { output: commandOutput, valueMode: true };
      const [, pipeline] = splitPipeline(command);
      await execute(command, execution);
      if (execution.value !== undefined && pipeline === null) return execution.value;
      return captured ? parsePipelineOutput(captured) : undefined;
    },
    enumerable: false
  });
  const cache = new Map();
  let rl;
  const recorder = createRecorder();
  recorder.setMode(settings.recordMode);
  Object.defineProperty(settings, 'recorder', {
    value: recorder,
    enumerable: false,
    writable: false
  });

  function persistHistory() {
    if (!persistent) return;
    try {
      saveHistory(historyFile, rl.history);
    } catch (error) {
      output.write(`Error: ${error.message}\n`);
    }
  }

  function persistParameters() {
    if (!persistent) return;
    try {
      saveEnvironment(parameterFile, settings.parameterDefaults, variables);
    } catch (error) {
      output.write(`Error: ${error.message}\n`);
    }
  }

  function applyParameterDefaults(defaults) {
    for (const name of QUERY_PARAMETER_NAMES) delete settingsTarget[name];
    const nextTarget = targetFromParameters(defaults);
    settingsTarget.parameterDefaults = defaults;
    settingsTarget.edgerc = defaults.edgerc || `${os.homedir()}/.edgerc`;
    settingsTarget.edgercSection = defaults.edgercSection || 'default';
    settingsTarget.accountSwitchKey = defaults.accountSwitchKey || '';
    settingsTarget.target = nextTarget;
    settingsTarget.contractId = nextTarget.contractId || '';
    settingsTarget.groupId = nextTarget.groupId || '';
    Object.assign(settingsTarget, Object.fromEntries(Object.entries(defaults)
      .filter(([name]) => QUERY_PARAMETER_NAMES.has(name) &&
        !TARGET_FIELDS.includes(name))));
  }

  async function execute(line, execution = {}) {
    const commandOutput = execution.output || output;
    const executeJavaScript = async (source) => {
      const value = await evaluateJavaScript(
        source, variables, false, isJavaScriptExpression(source), false
      );
      persistParameters();
      if (value !== undefined && !execution.valueMode) {
        const serialized = JSON.stringify(value);
        if (serialized !== undefined) commandOutput.write(`${serialized}\n`);
      }
      if (value !== undefined) execution.value = value;
    };
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('!')) {
      const shellCommand = trimmedLine.slice(1).trim();
      if (!shellCommand) throw new Error('Usage: ! <shell command>');
      await runShellCommand(shellCommand, '', commandOutput);
      return true;
    }
    if (isJavaScriptStatement(line)) {
      await executeJavaScript(line);
      return true;
    }
    const [commandLine, pipeline] = splitPipeline(line);
    const initialTokens = tokenize(commandLine);
    const initialCommand = initialTokens[0]?.toLowerCase();
    const requestCommand = ['get', 'post', 'put'].includes(initialCommand);
    const tokenAwareCommand = requestCommand || initialCommand === 'echo';
    const tokens = tokenAwareCommand
      ? expandTokenizedArguments(commandLine, variables, requestCommand)
      : tokenize(expandVariables(commandLine, variables));
    const expandedPipeline = pipeline === null ? null : expandVariables(pipeline, variables);
    const writeCommandResult = async (content) => {
      if (expandedPipeline !== null) {
        if (!expandedPipeline) throw new Error('Pipeline command cannot be empty');
        await runShellCommand(expandedPipeline, content, commandOutput);
      } else {
        commandOutput.write(content);
      }
    };
    if (!tokens.length) return true;
    const command = tokens.shift().toLowerCase();
    settings.logger.debug('Command received', { command });
    if (command === 'exit' || command === 'quit') return false;
    if (command === 'help' || command === '?') {
      await writeCommandResult(`${HELP}\n`);
      return true;
    }
    if (command === 'show') {
      const expression = commandLine.slice(command.length).trim();
      if (!expression) {
        const rendered = `${JSON.stringify(variables, null, 2)}\n`;
        if (expandedPipeline !== null) await runShellCommand(expandedPipeline, rendered, commandOutput);
        else commandOutput.write(rendered);
        execution.value = variables;
        return true;
      }
      let value;
      try {
        value = await evaluateJavaScript(expression, variables, true, true, false);
      } catch (error) {
        throw new Error(`Unable to evaluate show expression: ${error.message}`, { cause: error });
      }
      if (value === undefined) {
        throw new Error(`Show expression "${expression}" is undefined`);
      }
      let rendered;
      try {
        rendered = JSON.stringify(value, null, 2);
      } catch (error) {
        throw new Error(`Show expression "${expression}" is not JSON-serializable: ${error.message}`, {
          cause: error
        });
      }
      const renderedOutput = `${rendered}\n`;
      if (expandedPipeline !== null) await runShellCommand(expandedPipeline, renderedOutput, commandOutput);
      else commandOutput.write(renderedOutput);
      execution.value = value;
      return true;
    }
    if (command === 'echo') {
      const echoOutput = `${tokens.join(' ')}\n`;
      if (expandedPipeline !== null) {
        if (!expandedPipeline) throw new Error('Pipeline command cannot be empty');
        await runShellCommand(expandedPipeline, echoOutput, commandOutput);
      } else {
        commandOutput.write(echoOutput);
      }
      return true;
    }
    if (command === 'history') {
      const history = formatHistory(rl.history);
      if (history) await writeCommandResult(`${history}\n`);
      return true;
    }
    if (command === 'record') {
      const action = tokens.shift();
      if (action === 'show') {
        if (tokens.length > 1 || (tokens.length === 1 && tokens[0] !== '--http')) {
          throw new Error('Usage: record show [--http]');
        }
        const content = tokens[0] === '--http' ? recorder.http() : recorder.jsonl();
        if (content) await writeCommandResult(`${content}\n`);
        return true;
      }
      if (tokens.length || !['auto', 'on', 'off'].includes(action)) {
        throw new Error('Usage: record (auto|on|off) or record show [--http]');
      }
      recorder.setMode(action);
      settings.recordMode = action;
      return true;
    }
    if (command === 'find') {
      const request = parseFindArguments(tokens);
      const matches = await findResources(settings, request.path, request.query, requestGet);
      const outputBody = JSON.stringify(matches, null, 2);
      if (pipeline !== null) await runShellCommand(pipeline, `${outputBody}\n`, commandOutput);
      else commandOutput.write(`${outputBody}\n`);
      execution.value = matches;
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
    if (expandedPipeline !== null) {
      if (!pipeline) throw new Error('Pipeline command cannot be empty');
      await runShellCommand(expandedPipeline, `${outputBody}\n`, commandOutput);
    } else {
      commandOutput.write(`${outputBody}\n`);
    }
    execution.value = response.body;
    return true;
  }

  async function complete(line) {
    const showMatch = line.match(/^show\s+(\S*)$/);
    if (showMatch) {
      const expression = showMatch[1];
      if (!expression) {
        return [sortCandidates(Object.keys(variables)), expression];
      }
      return completeVariableReference(expression, variables) ||
        await completeVariableProperties(expression, variables) ||
        completeVariableName(expression, variables) || [[], expression];
    }
    if (/^[A-Za-z_$][\w$]*$/.test(line)) {
      const candidates = [
        ...COMMANDS.filter((command) => command.startsWith(line)),
        ...Object.keys(variables).filter((name) => name.startsWith(line))
      ];
      return [sortCandidates([...new Set(candidates)]), line];
    }
    const variableReference = completeVariableReference(line, variables);
    if (variableReference) return variableReference;
    const variableCompletion = await completeVariableProperties(line, variables);
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
    const findOptionMatch = line.match(/^find\s+\S+\s+(-\S*)$/);
    if (findOptionMatch) {
      const token = findOptionMatch[1];
      return [sortCandidates(['-q'].filter((option) => option.startsWith(token))), token];
    }
    const optionMatch = line.match(/^(get|post|put)\s+(-\S*)$/);
    if (optionMatch) {
      const token = optionMatch[2];
      return [sortCandidates(['-f'].filter((option) => option.startsWith(token))), token];
    }
    const queryMatch = line.match(/^(get|post|put)\s+(\S+)\s+(\S*)$/);
    if (queryMatch) {
      const [, method, pathToken, token] = queryMatch;
      const inputPath = expandCompletionPath(pathToken, variables);
      if (inputPath === null) return [[], token];
      const parameters = apiRegistry.parameterHelp(method.toUpperCase(), inputPath);
      const candidates = parameters.length
        ? parameters.map((parameter) => `${parameter.name}${parameter.in === 'body' ? ':=' : '=='}`)
        : QUERY_PARAMETER_CANDIDATES;
      return [sortCandidates(candidates.filter((candidate) => candidate.startsWith(token))), token];
    }
    const match = line.match(/^(get|post|put|find)\s+(\S*)$/);
    if (!match) return [[], line];
    const pathToken = match[2] || '/';
    const inputPath = expandCompletionPath(pathToken, variables);
    if (inputPath === null) return [[], pathToken];
    const [candidates] = await apiRegistry.completeMethod(
      match[1].toUpperCase(), inputPath, settings, cache, requestGet
    );
    const variableMatch = pathToken.match(VARIABLE_PATTERN);
    const variableIndex = variableMatch ? pathToken.indexOf(variableMatch[0]) : -1;
    const mappedCandidates = candidates.map((candidate) => {
      if (!candidate.startsWith(inputPath)) return candidate;
      const variablePath = variableMatch
        ? expandCompletionPath(variableMatch[0], variables)
        : null;
      if (variablePath !== null &&
          candidate.startsWith(variablePath) &&
          (candidate === variablePath || candidate[variablePath.length] === '/')) {
        return `${pathToken.slice(0, variableIndex)}${variableMatch[0]}${candidate.slice(variablePath.length)}`;
      }
      if (candidate === inputPath || inputPath.endsWith('/') || candidate[inputPath.length] === '/') {
        return `${pathToken}${candidate.slice(inputPath.length)}`;
      }
      return candidate;
    });
    return [mappedCandidates, pathToken];
  }

  async function showParameterHelp(line) {
    const match = line.match(/^(get|post|put)\s+(\S+)\s+(\S*)$/) ||
      line.match(/^(get|post|put)\s+(\S+)\?$/);
    if (!match) return false;
    const [, method, pathToken, token = '?'] = match;
    if (!token.endsWith('?')) return false;
    const apiPath = expandCompletionPath(pathToken, variables);
    if (apiPath === null) return false;
    const helpToken = token.slice(0, -1);
    const parameterName = helpToken === '' ? undefined : helpToken.replace(/(?:==|:=)$/, '');
    const assignment = helpToken.endsWith(':=') ? ':=' : '==';
    if (helpToken !== '' && !/^[A-Za-z0-9_-]+(?:==|:=)?$/.test(helpToken)) return false;
    const parameters = apiRegistry.parameterHelp(method.toUpperCase(), apiPath, parameterName);
    const help = formatParameterHelp(method, pathToken, parameters, parameterName, assignment);
    if (!help) return false;
    output.write(`\n${help}\n`);
    rl._refreshLine();
    return true;
  }

  rl = readline.createInterface({
    input,
    output,
    prompt: 'akamai> ',
    history: persistent ? loadHistory() : [],
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
  parseFindArguments,
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
  formatParameterHelp,
  addCompletionSeparator,
  contextCandidates: apiRegistry.API_MODULES.find((apiModule) =>
    apiModule.contextCandidates)?.contextCandidates
};
