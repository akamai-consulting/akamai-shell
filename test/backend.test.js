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

test('loads an optional startup JavaScript file during initialization', async (t) => {
  const startupFile = path.join('/tmp', `akamai-shell-startup-${process.pid}.js`);
  fs.writeFileSync(startupFile, 'startupValue = 42\n');
  t.after(() => fs.rmSync(startupFile, { force: true }));
  const { input, messages, backend } = harness({ startupFile });
  input.write(JSON.stringify({ id: 27, type: 'initialize', startupFile }) + '\n');
  input.write('{"id":28,"type":"evaluate","source":"startupValue"}\n');
  await settle();
  await backend.queue;
  assert.equal(messages.find((message) => message.id === 28 && message.type === 'result').result.value, 42);
  await backend.shutdown();
});

test('uses config timeout default for evaluations', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":21,"type":"evaluate","source":"config.timeout.default = 2500"}\n');
  await settle();
  await backend.queue;
  assert.equal(backend.settings.timeout.default, 2500);
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
  input.write('{"id":4,"type":"command","source":"get /papi/v1/properties?groupId=grp contractId==ctr"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(messages.find((message) => message.id === 4 && message.type === 'result').result, { ok: true });
  assert.equal(calls[0].apiPath, '/papi/v1/properties');
  assert.deepEqual(calls[0].query, { groupId: 'grp', contractId: 'ctr' });
  assert.equal(calls[0].requestGet, requestGet);
  await backend.shutdown();
});

test('parses HTTPie-style query and JSON body arguments', async () => {
  const calls = [];
  const registry = {
    dispatch: async (method, settings, apiPath, query, body) => {
      calls.push({ method, apiPath, query, body });
      return { statusCode: 200, body: { ok: true } };
    }
  };
  const { input, backend } = harness({ apiRegistry: registry });
  input.write(JSON.stringify({
    id: 53,
    type: 'command',
    source: 'post /example q==bar name=hello tags:=[1,2]'
  }) + '\n');
  await settle();
  await backend.queue;
  assert.deepEqual(calls[0], {
    method: 'POST',
    apiPath: '/example',
    query: { q: 'bar' },
    body: { name: 'hello', tags: [1, 2] }
  });
  await backend.shutdown();
});

test('expands variables in non-JavaScript command input', async () => {
  const calls = [];
  const registry = {
    get: async (settings, apiPath) => {
      calls.push(apiPath);
      return { statusCode: 200, body: { ok: true } };
    }
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write('{"id":44,"type":"evaluate","source":"pp = \\"/papi/v1/properties/prp_526230\\""}\n');
  input.write('{"id":45,"type":"command","source":"get $pp"}\n');
  await settle();
  await backend.queue;
  assert.equal(calls[0], '/papi/v1/properties/prp_526230');
  assert.deepEqual(messages.find((message) => message.id === 45 && message.type === 'result').result, { ok: true });
  await backend.shutdown();
});

test('pipes show output through local shell commands', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":46,"type":"command","source":"show config | head -1"}\n');
  await settle();
  await backend.queue;
  const result = messages.find((message) => message.id === 46 && message.type === 'result').result;
  assert.match(result, /^\{\n/);
  await backend.shutdown();
});

test('evaluates structured expressions passed to show', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":49,"type":"command","source":"show config[\\"target\\"]"}\n');
  await settle();
  await backend.queue;
  const result = messages.find((message) => message.id === 49 && message.type === 'result');
  assert.deepEqual(result.result, backend.settings.target);
  await backend.shutdown();
});

test('pipes every command result, including help and shell escapes', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":47,"type":"command","source":"help | head -1"}\n');
  input.write('{"id":48,"type":"command","source":"! printf hello | head -1"}\n');
  await settle();
  await backend.queue;
  assert.equal(messages.find((message) => message.id === 47 && message.type === 'result').result, 'get <api-path> [query]\n');
  assert.equal(messages.find((message) => message.id === 48 && message.type === 'result').result, 'hello');
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

test('set and show expose the current session state', async () => {
  const { input, messages, backend } = harness();
  input.write('{"id":5,"type":"command","source":"set edgerc-section staging"}\n');
  input.write('{"id":51,"type":"evaluate","source":"visibleValue = 42"}\n');
  input.write('{"id":6,"type":"command","source":"show"}\n');
  await settle();
  await backend.queue;
  assert.equal(Object.prototype.hasOwnProperty.call(
    messages.find((message) => message.id === 5 && message.type === 'result'),
    'result'
  ), false);
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

test('automatically awaits substitutions interactively but not in scripts', async () => {
  const registry = {
    get: async () => ({ statusCode: 200, body: { path: '/properties/prp_1' } })
  };
  const interactive = harness({ apiRegistry: registry });
  interactive.input.write('{"id":30,"type":"evaluate","source":"$(\\"get /papi/v1/properties\\").path"}\n');
  await settle();
  await interactive.backend.queue;
  assert.equal(
    interactive.messages.find((message) => message.id === 30 && message.type === 'result').result.value,
    '/properties/prp_1'
  );
  await interactive.backend.shutdown();

  const script = harness({ apiRegistry: registry });
  script.input.write(JSON.stringify({
    id: 31,
    type: 'initialize',
    scriptPath: '/tmp/example-script.as'
  }) + '\n');
  script.input.write('{"id":32,"type":"evaluate","source":"typeof $(\\"get /papi/v1/properties\\").then"}\n');
  await settle();
  await script.backend.queue;
  assert.equal(
    script.messages.find((message) => message.id === 32 && message.type === 'result').result.value,
    'function'
  );
  await script.backend.shutdown();
});

test('provides JavaScript and shell completion through the backend', async () => {
  const registry = {
    completeMethod: async (method, inputPath) => {
      if (inputPath === '/papi/v1/properties/prp_526230/') {
        return [['/papi/v1/properties/prp_526230/versions'], inputPath];
      }
      return [['/papi/v1/properties'], '/papi/v1/pr'];
    },
    hasCompletionDescendants: () => false,
    parameterHelp: () => [{ name: 'contractId' }, { name: 'groupId' }]
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write('{"id":12,"type":"complete","source":"get /papi/v1/pr"}\n');
  input.write('{"id":28,"type":"complete","source":"get /papi/v1/properties"}\n');
  input.write('{"id":29,"type":"complete","source":"get /papi/v1/properties "}\n');
  input.write('{"id":13,"type":"complete","source":"sho"}\n');
  input.write('{"id":27,"type":"complete","source":"set edg"}\n');
  input.write('{"id":14,"type":"evaluate","source":"pp = \\"/papi/v1/properties/prp_526230\\""}\n');
  input.write('{"id":15,"type":"complete","source":"get $pp/"}\n');
  input.write('{"id":18,"type":"evaluate","source":"config = { edgercSection: \\"papi\\", target: { groupId: \\"grp\\", contractId: \\"ctr\\" } }"}\n');
  input.write('{"id":19,"type":"complete","source":"config"}\n');
  input.write('{"id":20,"type":"complete","source":"config["}\n');
  input.write('{"id":21,"type":"complete","source":"config[\\"edgercS"}\n');
  input.write('{"id":22,"type":"complete","source":"config[\\"target\\"]"}\n');
  input.write('{"id":23,"type":"complete","source":"config[\\"target\\"]."}\n');
  input.write('{"id":24,"type":"complete","source":"config[\\"target\\"][\\"co"}\n');
  input.write('{"id":25,"type":"complete","source":"show confi"}\n');
  input.write('{"id":26,"type":"complete","source":"show config[\\"target\\"]."}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(
    messages.find((message) => message.id === 12 && message.type === 'result').result.candidates,
    ['/papi/v1/properties']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 28 && message.type === 'result').result.candidates,
    ['/papi/v1/properties ']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 29 && message.type === 'result').result.candidates,
    ['contractId==', 'groupId==']
  );
  assert.ok(messages.find((message) => message.id === 13 && message.type === 'result')
  .result.candidates.includes('show'));
  assert.deepEqual(
  messages.find((message) => message.id === 27 && message.type === 'result').result.candidates,
  ['set edgerc', 'set edgerc-section', 'set edgercSection']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 15 && message.type === 'result').result.candidates,
    ['$pp/versions']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 19 && message.type === 'result').result.candidates,
    ['config[']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 20 && message.type === 'result').result.candidates,
    ['config["edgercSection"]', 'config["target"]']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 21 && message.type === 'result').result.candidates,
    ['config["edgercSection"]']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 22 && message.type === 'result').result.candidates,
    ["config[\"target\"]["]
  );
  assert.deepEqual(
    messages.find((message) => message.id === 23 && message.type === 'result').result.candidates,
    ['config["target"].groupId', 'config["target"].contractId']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 24 && message.type === 'result').result.candidates,
    ['config["target"]["contractId"]']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 25 && message.type === 'result').result.candidates,
    ['show config']
  );
  assert.deepEqual(
    messages.find((message) => message.id === 26 && message.type === 'result').result.candidates,
    ['show config["target"].groupId', 'show config["target"].contractId']
  );
  await backend.shutdown();
});

test('provides OpenAPI parameter context help without changing the input', async () => {
  const registry = {
    parameterHelp: () => [
      { name: 'groupId', in: 'query', description: 'The group identifier.' },
      { name: 'contractId', in: 'query', description: 'The contract identifier. Used for filtering.' },
      { name: 'createFromVersion', in: 'body', schema: { type: 'integer' },
        description: 'The version.' },
      { name: 'createFromVersionEtag', in: 'body', schema: { type: 'string' },
        description: 'The version ETag.' },
      { name: 'contractId', description: 'Duplicate entry.' }
    ]
  };
  const { input, messages, backend } = harness({ apiRegistry: registry });
  input.write(JSON.stringify({
    id: 52,
    type: 'context-help',
    source: 'post /papi/v1/properties '
  }) + '\n');
  input.write(JSON.stringify({
    id: 54,
    type: 'complete',
    source: 'post /papi/v1/properties createFromVersion:'
  }) + '\n');
  input.write(JSON.stringify({
    id: 55,
    type: 'context-help',
    source: 'post /papi/v1/properties createFromVersion:='
  }) + '\n');
  await settle();
  await backend.queue;
  assert.deepEqual(
    messages.find((message) => message.id === 52 && message.type === 'result').result,
    [
      { name: 'contractId==', description: 'The contract identifier.' },
      { name: 'createFromVersion:=', description: 'The version.' },
      { name: 'createFromVersionEtag=', description: 'The version ETag.' },
      { name: 'groupId==', description: 'The group identifier.' }
    ]
  );
  assert.deepEqual(
    messages.find((message) => message.id === 54 && message.type === 'result').result,
    { candidates: ['createFromVersion:='], replacement: 'createFromVersion:' }
  );
  assert.deepEqual(
    messages.find((message) => message.id === 55 && message.type === 'result').result,
    [{ name: 'createFromVersion:=', description: 'The version.' }]
  );
  await backend.shutdown();
});

test('initializes native script module bindings and arguments', async () => {
  const { input, messages, backend } = harness();
  input.write(JSON.stringify({
    id: 16,
    type: 'initialize',
    scriptPath: '/tmp/example-script.as',
    scriptArgs: ['one', 'two'],
    workingDirectory: '/tmp'
  }) + '\n');
  input.write('{"id":17,"type":"evaluate","source":"[process.argv[1], process.argv[2], __dirname, typeof require]"}\n');
  await settle();
  await backend.queue;
  assert.deepEqual(
    messages.find((message) => message.id === 17 && message.type === 'result').result.value,
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
