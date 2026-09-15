'use strict';

const readline = require('readline');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { get } = require('./papi-client');
const { pathCandidates, collectionFor, dynamicCandidates } = require('./catalog');

const SETTING_NAMES = [
  'edgerc',
  'edgerc-section',
  'account-switch-key',
  'contract-id',
  'group-id'
];
const HISTORY_SIZE = 1000;
const HISTORY_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'history');
const ENV_FILE = path.join(os.homedir(), '.config', 'akamai-shell', 'env');
const CONTEXT_LOOKUPS = {
  'contract-id': { path: '/contracts', responseKey: 'contracts' },
  'group-id': { path: '/groups', responseKey: 'groups' }
};
const QUERY_PARAMETER_NAMES = new Set([
  'accountSwitchKey', 'contractId', 'groupId', 'limit', 'offset', 'sort',
  'network', 'modifiedSince', 'modifiedNetwork', 'includeHostnames',
  'includeCertStatus', 'validateRules', 'validateMode', 'dryRun', 'lock',
  'options', 'hostname', 'cnameTo', 'activatedOn'
]);
const QUERY_PARAMETER_CANDIDATES = [...QUERY_PARAMETER_NAMES].sort().map((name) => `${name}==`);

function settingCandidates(token = '') {
  return SETTING_NAMES.filter((name) => name.startsWith(token));
}

function contextCandidates(setting, body, partial = '') {
  const lookup = CONTEXT_LOOKUPS[setting];
  const items = body && body[lookup.responseKey] && body[lookup.responseKey].items;
  if (!lookup || !Array.isArray(items)) return [];
  return items
    .map((item) => setting === 'contract-id' ? item.contractId : item.groupId)
    .filter((id) => id && id.toLowerCase().startsWith(partial.toLowerCase()));
}

const HELP = `Commands:
  get <api-path>[?query=value]  Perform a read-only GET request
      name==value ...            HTTPie-style query parameters
  set edgerc <path>             Set the EdgeGrid resource file
  set edgerc-section <name>     Set the EdgeGrid credential section
  set account-switch-key <key>  Set the target account switch key
  set contract-id <id>          Set the default contract ID
  set group-id <id>             Set the default group ID
  set <name> <value>            Set a custom shell variable
  set                            Show settings and custom variables
  unset <name>                   Clear a setting or variable
  unset -a                       Clear all API parameter defaults
  save [-f <path>]               Save parameter defaults
  load [-f <path>]               Load parameter defaults
  echo <text>                    Print text with variable expansion
  history                        Show command history
  show                           Show non-secret settings
  help                           Show this help
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
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
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

function createRepl(output = process.stdout, input = process.stdin, requestGet = get, historyFile = HISTORY_FILE) {
  const settings = {
    edgerc: `${os.homedir()}/.edgerc`,
    edgercSection: 'default',
    accountSwitchKey: '',
    contractId: '',
    groupId: '',
    parameterDefaults: loadParameterDefaults(historyFile === HISTORY_FILE ? ENV_FILE : path.join(path.dirname(historyFile), 'env'))
  };
  settings.accountSwitchKey = settings.parameterDefaults.accountSwitchKey || '';
  settings.contractId = settings.parameterDefaults.contractId || '';
  settings.groupId = settings.parameterDefaults.groupId || '';
  const variables = {};
  const cache = new Map();
  let rl;

  function persistHistory() {
    try {
      saveHistory(historyFile, rl.history);
    } catch (error) {
      output.write(`Error: ${error.message}\n`);
    }
  }

  function persistParameters() {
    try {
      saveParameterDefaults(
        historyFile === HISTORY_FILE ? ENV_FILE : path.join(path.dirname(historyFile), 'env'),
        settings.parameterDefaults
      );
    } catch (error) {
      output.write(`Error: ${error.message}\n`);
    }
  }

  function applyParameterDefaults(defaults) {
    settings.parameterDefaults = defaults;
    settings.accountSwitchKey = defaults.accountSwitchKey || '';
    settings.contractId = defaults.contractId || '';
    settings.groupId = defaults.groupId || '';
  }

  async function execute(line) {
    const [commandLine, pipeline] = splitPipeline(line);
    const tokens = tokenize(commandLine);
    if (!tokens.length) return true;
    const command = tokens.shift().toLowerCase();
    if (pipeline !== null && command !== 'get') {
      throw new Error('Pipelines are supported only after get commands');
    }

    if (command === 'exit' || command === 'quit') return false;
    if (command === 'help') {
      output.write(`${HELP}\n`);
      return true;
    }
    if (command === 'show') {
      output.write(`${JSON.stringify(settings, null, 2)}\n`);
      return true;
    }
    if (command === 'echo') {
      output.write(`${tokens.join(' ').replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => variables[name] ?? '')}\n`);
      return true;
    }
    if (command === 'history') {
      const history = formatHistory(rl.history);
      if (history) output.write(`${history}\n`);
      return true;
    }
    if (command === 'save' || command === 'load') {
      const filePath = optionPath(tokens);
      if (command === 'save') {
        saveParameterDefaults(filePath, settings.parameterDefaults);
      } else {
        applyParameterDefaults(loadParameterDefaults(filePath));
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
      if (SETTING_NAMES.includes(name) && ['accountSwitchKey', 'contractId', 'groupId'].includes(
        name === 'account-switch-key' ? 'accountSwitchKey'
          : name === 'contract-id' ? 'contractId'
            : name === 'group-id' ? 'groupId' : ''
      )) {
        const parameterName = name === 'account-switch-key' ? 'accountSwitchKey'
          : name === 'contract-id' ? 'contractId' : 'groupId';
        settings.parameterDefaults[parameterName] = value;
      }
      persistParameters();
      cache.clear();
      return true;
    }
    if (command !== 'get') {
      throw new Error('Usage: get <api-path> [name==value ...]');
    }

    const request = parseGetArguments(tokens);
    request.query = Object.fromEntries(Object.entries(request.query).map(([name, value]) => [
      name,
      value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, variable) => variables[variable] ?? '')
    ]));
    const response = await get(settings, request.path, request.query);
    const outputBody = bodyText(response.body);
    if (pipeline !== null) {
      if (!pipeline) throw new Error('Pipeline command cannot be empty');
      await runShellCommand(pipeline, `${outputBody}\n`, output);
    } else {
      output.write(`${outputBody}\n`);
    }
    return true;
  }

  async function complete(line) {
    if (/^set\s*$/.test(line)) {
      return [SETTING_NAMES, ''];
    }
    const contextMatch = line.match(/^set\s+(contract-id|group-id)\s+(\S*)$/);
    if (contextMatch) {
      const setting = contextMatch[1];
      const partial = contextMatch[2];
      const lookup = CONTEXT_LOOKUPS[setting];
      const cacheKey = `${lookup.path}|${settings.edgerc}|${settings.edgercSection}|${settings.accountSwitchKey}`;
      try {
        let body = cache.get(cacheKey);
        if (!body) {
          body = (await get(settings, lookup.path)).body;
          cache.set(cacheKey, body);
        }
        return [contextCandidates(setting, body, partial), partial];
      } catch {
        return [[], partial];
      }
    }
    const setMatch = line.match(/^set\s+(\S*)$/);
    if (setMatch) {
      const token = setMatch[1];
      return [settingCandidates(token), token];
    }
    const queryMatch = line.match(/^get\s+\S+\s+(\S*)$/);
    if (queryMatch) {
      const token = queryMatch[1];
      return [QUERY_PARAMETER_CANDIDATES.filter((candidate) => candidate.startsWith(token)), token];
    }
    const match = line.match(/^get\s+(\S*)$/);
    if (!match) return [[], line];
    const inputPath = match[1] || '/';
    const staticMatches = pathCandidates(inputPath);
    const dynamic = collectionFor(inputPath);
    if (!dynamic || inputPath === dynamic.collection) {
      return [staticMatches, inputPath];
    }
    const collectionPath = typeof dynamic.collection === 'function'
      ? dynamic.collection(inputPath) : dynamic.collection;
    const cacheKey = `${collectionPath}|${settings.edgerc}|${settings.edgercSection}|${settings.accountSwitchKey}`;
    try {
      let body = cache.get(cacheKey);
      if (!body) {
        body = (await requestGet(settings, collectionPath)).body;
        cache.set(cacheKey, body);
      }
      const candidates = dynamicCandidates(inputPath, body);
      const candidatePaths = candidates.map((candidate) =>
      `${dynamic.pathPrefix(inputPath)}${candidate}`);
      return [candidatePaths.length ? candidatePaths : staticMatches, inputPath];
    } catch {
      return [staticMatches, inputPath];
    }
  }

  rl = readline.createInterface({
    input,
    output,
    prompt: 'prompt> ',
    history: loadHistory(),
    historySize: HISTORY_SIZE,
    removeHistoryDuplicates: true,
    completer(line, callback) {
      complete(line).then((result) => callback(null, result), (error) => callback(error));
    }
  });
  if (input.isTTY && output.isTTY) {
    const ttyWrite = rl._ttyWrite.bind(rl);
    let searchTerm = null;
    let searchStart = 0;
    rl._ttyWrite = (character, key) => {
      if (key && key.ctrl && key.name === 'r') {
        if (searchTerm === null) {
          searchTerm = rl.line;
          searchStart = 0;
        }
        const match = findHistoryMatch(rl.history, searchTerm, searchStart);
        if (match) {
          ttyWrite(null, { ctrl: true, name: 'u' });
          ttyWrite(match.command, {});
          searchStart = match.index + 1;
        }
        return;
      }
      searchTerm = null;
      searchStart = 0;
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
  return { rl, settings, execute, complete };
}

module.exports = {
  createRepl,
  parseQuery,
  parseGetArguments,
  QUERY_PARAMETER_CANDIDATES,
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
  contextCandidates
};
