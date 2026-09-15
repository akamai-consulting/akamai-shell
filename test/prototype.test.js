'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createRepl,
  parseQuery,
  tokenize,
  splitPipeline,
  formatHistory,
  findHistoryMatch,
  loadHistory,
  saveHistory,
  settingCandidates,
  contextCandidates
} = require('../src/repl');
const { dynamicCandidates, pathCandidates } = require('../src/catalog');

test('parses a PAPI path and query parameters', () => {
  assert.deepEqual(parseQuery('/properties?limit=2&accountSwitchKey=a%3Ab'), {
    path: '/properties',
    query: { limit: '2', accountSwitchKey: 'a:b' }
  });
});

test('tokenizes quoted shell values', () => {
  assert.deepEqual(tokenize('set edgerc "~/.edgerc"'), ['set', 'edgerc', '~/.edgerc']);
});

test('completes dynamic edge hostname identifiers', () => {
  assert.deepEqual(dynamicCandidates('/edgehostnames/ehn_', {
    edgeHostnames: {
      items: [
        { edgeHostnameId: 'ehn_1', edgeHostnameDomain: 'one.example' },
        { edgeHostnameId: 'other' }
      ]
    }
  }), ['ehn_1']);
});

test('provides static PAPI path candidates', () => {
  assert(pathCandidates('/properties').includes('/properties'));
});

test('completes a partial static path segment', () => {
  assert.deepEqual(pathCandidates('/cp'), ['/cpcodes']);
});

test('resolves nested paths after a dynamic property ID', () => {
  assert.deepEqual(
    pathCandidates('/properties/prp_615111/'),
    ['/properties/prp_615111/versions']
  );
});

test('provides set command setting candidates', () => {
  assert.deepEqual(settingCandidates(''), [
    'edgerc',
    'edgerc-section',
    'account-switch-key',
    'contract-id',
    'group-id'
  ]);
  assert.deepEqual(settingCandidates('edgerc-'), ['edgerc-section']);
  assert.deepEqual(settingCandidates('account'), ['account-switch-key']);
  assert.deepEqual(settingCandidates('contract'), ['contract-id']);
});

test('completes contract and group IDs from collection responses', () => {
  assert.deepEqual(contextCandidates('contract-id', {
    contracts: { items: [{ contractId: 'ctr_one' }, { contractId: 'ctr_two' }] }
  }, 'ctr_t'), ['ctr_two']);
  assert.deepEqual(contextCandidates('group-id', {
    groups: { items: [{ groupId: 'grp_one' }, { groupId: 'grp_two' }] }
  }, 'grp_'), ['grp_one', 'grp_two']);
});

test('splits a get command from a shell pipeline', () => {
  assert.deepEqual(splitPipeline("get /groups | jq '.groups.items'"), [
    'get /groups',
    "jq '.groups.items'"
  ]);
  assert.deepEqual(splitPipeline("get '/groups|not-a-pipe'"), [
    "get '/groups|not-a-pipe'",
    null
  ]);
});

test('formats command history with oldest entries first', () => {
  assert.equal(formatHistory(['show', 'get /groups']), '1  get /groups\n2  show');
});

test('finds reverse history matches from newest to oldest', () => {
  const history = ['get /properties', 'get /groups', 'get /properties?limit=2'];
  assert.deepEqual(findHistoryMatch(history, 'get /properties'), {
    command: 'get /properties',
    index: 0
  });
  assert.deepEqual(findHistoryMatch(history, 'get /properties', 1), {
    command: 'get /properties?limit=2',
    index: 2
  });
});

test('does not crash when a pipeline command closes stdin early', async () => {
  const output = new PassThrough();
  let result = '';
  output.on('data', (chunk) => {
    result += chunk.toString();
  });
  const { runShellCommand } = require('../src/repl');
  await runShellCommand('head -n 1', `${'line\n'.repeat(100000)}`, output);
  assert.equal(result, 'line\n');
  output.destroy();
});

test('persists history in chronological file order', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-history-'));
  const filePath = path.join(directory, 'history');
  saveHistory(filePath, ['show', 'get /groups']);
  assert.equal(fs.readFileSync(filePath, 'utf8'), 'get /groups\nshow\n');
  assert.deepEqual(loadHistory(filePath), ['show', 'get /groups']);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('defines, expands, lists, and unsets custom variables', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });
  const repl = createRepl(output, input, undefined, historyPath);

  await repl.execute('set foo bar baz');
  await repl.execute('echo $foo');
  assert.match(printed, /bar baz\n/);
  printed = '';
  await repl.execute('set');
  assert.match(printed, /"foo": "bar baz"/);
  await repl.execute('unset foo');
  printed = '';
  await repl.execute('echo $foo');
  assert.equal(printed, '\n');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('loads an empty history when the history file does not exist', () => {
  const filePath = path.join(os.tmpdir(), `akamai-shell-history-${process.pid}-missing`);
  assert.deepEqual(loadHistory(filePath), []);
});

test('completes edge hostname IDs from the edge hostname collection', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  const requests = [];
  const repl = createRepl(output, input, async (settings, path) => {
    requests.push({ settings, path });
    return {
      body: {
        edgeHostnames: {
          items: [
            { edgeHostnameId: 'ehn_123' },
            { edgeHostnameId: 'ehn_456' }
          ]
        }
      }
    };
  }, historyPath);

  const result = await repl.complete('get /edgehostnames/ehn_');
  assert.deepEqual(result, [
    ['/edgehostnames/ehn_123', '/edgehostnames/ehn_456'],
    '/edgehostnames/ehn_'
  ]);
  assert.equal(requests[0].path, '/edgehostnames');
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});
