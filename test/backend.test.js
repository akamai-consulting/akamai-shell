'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const path = require('node:path');
const { createBackend } = require('../src/backend');

function harness(options = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  output.on('data', (chunk) => messages.push(...chunk.toString().trim().split('\n').filter(Boolean).map(JSON.parse)));
  const backend = createBackend({ input, output, timeout: 100, ...options });
  return { input, messages, backend };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('handles initialize and evaluates in a persistent global context', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":1,"type":"initialize"}\n');
  input.write('{"id":2,"type":"evaluate","code":"globalThis.answer = 41"}\n');
  input.write('{"id":3,"type":"evaluate","code":"answer + 1"}\n');
  await settle();
  await backend.queue;
  assert.equal(messages.find((message) => message.id === 3 && message.type === 'result').result.value, 42);
  await backend.shutdown();
});

test('serializes requests and reports structured output and errors', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":"a","type":"evaluate","code":"console.log(\\"hello\\"); 1"}\n');
  input.write('{"id":"b","type":"evaluate","code":"throw new Error(\\"bad\\")"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(messages.filter((message) => message.id === 'a').map((message) => message.type).slice(-2), ['result', 'done']);
  assert.equal(messages.find((message) => message.id === 'b' && message.type === 'error').error.message, 'bad');
  await backend.shutdown();
});

test('times out a long asynchronous evaluation and completes identifiers', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":1,"type":"evaluate","code":"await new Promise(resolve => setTimeout(resolve, 200))"}\n');
  input.write('{"id":2,"type":"complete","code":"Math.ra"}\n');
  await settle();
  await backend.queue;
  assert.match(messages.find((message) => message.id === 1 && message.type === 'error').error.message, /timed out/i);
  assert.ok(messages.find((message) => message.id === 2 && message.type === 'result').result.candidates.includes('Math.random'));
  await backend.shutdown();
});

test('exit emits a final done message and closes deterministically', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":9,"type":"exit"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(messages.slice(-2).map((message) => message.type), ['result', 'done']);
  assert.equal(backend.closed, true);
});

test('dispatches get commands through the API registry', async () => {
  const calls = [];
  const registry = {
    get: async (settings, apiPath, query, requestGet) => {
      calls.push({ settings, apiPath, query, requestGet });
      return { statusCode: 200, body: { ok: true } };
    },
    dispatch() {
      throw new Error('unexpected write');
    }
  };
  const requestGet = () => {};
  const { input, messages, backend } = harness({ apiRegistry: registry, requestGet });
  input.write('{"id":4,"type":"command","source":"get /papi/v1/properties?groupId=grp contractId=ctr"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(messages.find((message) => message.id === 4 && message.type === 'result').result, { ok: true });
  assert.equal(calls[0].apiPath, '/papi/v1/properties');
  assert.deepEqual(calls[0].query, { groupId: 'grp', contractId: 'ctr' });
  assert.equal(calls[0].requestGet, requestGet);
  await backend.shutdown();
});

test('exposes config target values to API dispatch', async () => {
  const calls = [];
  const registry = {
    get: async (settings) => {
      calls.push(settings);
      return { statusCode: 200, body: { ok: true } };
    }
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write('{"id":41,"type":"evaluate","source":"config[\\"target\\"].contractId = \\"ctr_target\\""}\n');
  input.write('{"id":42,"type":"evaluate","source":"config.target = { contractId: \\"ctr_replaced\\", groupId: \\"grp_target\\" }"}\n');
  input.write('{"id":43,"type":"command","source":"get /papi/v1/properties"}\n');
  await settle();
  await backend.queue;
  assert.equal(messages.find((message) => message.id === 41 && message.type === 'result').result.value, 'ctr_target');
  assert.equal(calls[0].target.contractId, 'ctr_replaced');
  assert.equal(calls[0].target.groupId, 'grp_target');
  assert.equal(calls[0].contractId, '');
  await backend.shutdown();
});

test('set and show expose only non-sensitive backend settings', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":5,"type":"command","source":"set edgerc-section staging"}\n');
  input.write('{"id":51,"type":"evaluate","source":"visibleValue = 42"}\n');
  input.write('{"id":6,"type":"command","source":"show"}\n');
  await settle();
  await backend.queue;
  assert.equal(messages.find((message) => message.id === 5 && message.type === 'result').result['edgerc-section'], 'staging');
  const state = messages.find((message) => message.id === 6 && message.type === 'result').result;
  assert.equal(state.config.edgercSection, 'staging');
  assert.equal(state.visibleValue, 42);
  await backend.shutdown();
});

test('routes recognized commands separately from JavaScript evaluation', async () => {
  const registry = {
    get: async () => ({ statusCode: 200, body: { answer: 42 } }),
    dispatch: async () => ({ statusCode: 200, body: {} })
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write('{"id":7,"type":"command","source":"get /papi/v1/properties"}\n');
  input.write('{"id":8,"type":"command","source":"globalThis.value = 9"}\n');
  input.write('{"id":9,"type":"command","source":"value + 1"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(messages.find((message) => message.id === 7 && message.type === 'result').result, { answer: 42 });
  assert.equal(messages.find((message) => message.id === 9 && message.type === 'result').result, 10);
  await backend.shutdown();
});

test('provides command substitution in native JavaScript evaluation', async () => {
  const registry = {
    get: async () => ({ statusCode: 200, body: { value: 7 } }),
    dispatch: async () => ({ statusCode: 200, body: {} })
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write('{"id":10,"type":"evaluate","code":"globalThis.substituted = (await $(\\\"get /papi/v1/properties\\\")).value; substituted"}\n');
  input.write('{"id":11,"type":"evaluate","code":"substituted"}\n');
  await settle();
  await backend.queue;
  const result = messages.find((message) => message.id === 10 && message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  assert.equal(messages.find((message) => message.id === 11 && message.type === 'result').result.value, 7);
  await backend.shutdown();
});

test('provides JavaScript and shell completion through the backend', async () => {
  const registry = {
    completeMethod: async () => [['/papi/v1/properties'], '/papi/v1/pr']
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write('{"id":12,"type":"complete","source":"get /papi/v1/pr"}\n');
  input.write('{"id":13,"type":"complete","source":"set"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(
    messages.find((message) => message.id === 12 && message.type === 'result').result.candidates,
    ['/papi/v1/properties']
  );
  assert.ok(messages.find((message) => message.id === 13 && message.type === 'result')
    .result.candidates.includes('set'));
  await backend.shutdown();
});

test('initializes native script module bindings and arguments', async () => {
  const { input, messages, backend } = harness();
  input.write(JSON.stringify({
    id: 14,
    type: 'initialize',
    scriptPath: '/tmp/example-script.as',
    scriptArgs: ['one', 'two'],
    workingDirectory: '/tmp'
  }) + '\n');
  input.write('{"id":15,"type":"evaluate","source":"[process.argv[1], process.argv[2], __dirname, typeof require]"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(
    messages.find((message) => message.id === 15 && message.type === 'result').result.value,
    ['/tmp/example-script.as', 'one', '/tmp', 'function']
  );
  await backend.shutdown();
});

test('saves and loads the new executable JavaScript state format', async (t) => {
  const stateFile = path.join('/tmp', `akamai-shell-state-${process.pid}.js`);
  t.after(() => fs.rmSync(stateFile, { force: true }));
  const { input, messages, backend } = harness();
  input.write('{"id":16,"type":"evaluate","source":"config = { custom: 7 }; savedValue = { answer: 42 }"}\n');
  input.write(JSON.stringify({ id: 17, type: 'command', source: `save ${stateFile}` }) + '\n');
  input.write('{"id":18,"type":"evaluate","source":"config = {}; savedValue = undefined"}\n');
  input.write(JSON.stringify({ id: 19, type: 'command', source: `load ${stateFile}` }) + '\n');
  input.write('{"id":20,"type":"evaluate","source":"config.custom + savedValue.answer"}\n');
  await settle();
  await backend.queue;
  assert.equal(messages.find((message) => message.id === 20 && message.type === 'result').result.value, 49);
  const stateSource = fs.readFileSync(stateFile, 'utf8');
  assert.match(stateSource, /globalThis\.config/);
  assert.match(stateSource, /globalThis\.savedValue/);
  assert.match(stateSource, /"custom": 7/);
  await backend.shutdown();
});
