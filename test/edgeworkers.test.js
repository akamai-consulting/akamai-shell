'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const edgeWorkers = require('../src/apis/edgeworkers');

test('discovers and routes EdgeWorkers paths', async () => {
  assert.equal(apiRegistry.moduleFor('/edgeworkers/v1/ids').name, 'EdgeWorkers');
  assert(edgeWorkers.methodPaths.GET.includes('/ids/{edgeWorkerId}'));
  assert(edgeWorkers.methodPaths.POST.includes('/ids'));
  assert(edgeWorkers.methodPaths.PUT.includes('/ids/{edgeWorkerId}'));

  let request;
  const response = await apiRegistry.get({}, '/edgeworkers/v1/ids',
    { groupId: '42', accountSwitchKey: 'ask' }, async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { edgeWorkerIds: [] } };
    });
  assert.deepEqual(request, {
    settings: {}, path: '/ids', query: { groupId: '42', accountSwitchKey: 'ask' }
  });
  assert.equal(response.statusCode, 200);
});

test('routes documented EdgeWorkers writes and rejects unsupported methods', async () => {
  let request;
  await apiRegistry.post({}, '/edgeworkers/v1/ids', { accountSwitchKey: 'ask' },
    { groupId: 42, name: 'worker' }, async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { edgeWorkerId: 7 } };
    });
  assert.deepEqual(request, {
    settings: {}, path: '/ids', query: { accountSwitchKey: 'ask' },
    body: { groupId: 42, name: 'worker' }, method: 'POST'
  });

  await apiRegistry.put({}, '/edgeworkers/v1/ids/7', {}, { name: 'renamed' },
    async (settings, path, query, body, method) => {
      assert.deepEqual({ path, query, body, method }, {
        path: '/ids/7', query: {}, body: { name: 'renamed' }, method: 'PUT'
      });
      return { statusCode: 200, body: { edgeWorkerId: 7 } };
    });
  assert.throws(() => apiRegistry.post({}, '/edgeworkers/v1/ids/7', {}, {}),
    /No API module supports POST path/);
  assert.throws(() => apiRegistry.put({}, '/edgeworkers/v1/ids/7/activations', {}, {}),
    /No API module supports PUT path/);
});

test('completes EdgeWorkers static and dynamic identifiers with caching', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.equal(query && Object.keys(query).length, 0);
    if (path === '/ids') return { statusCode: 200, body: {
      edgeWorkerIds: [{ edgeWorkerId: 42 }, { edgeWorkerId: 99 }]
    } };
    if (path === '/ids/42/versions') return { statusCode: 200, body: {
      versions: [{ version: '1' }, { version: '2' }]
    } };
    throw new Error(`unexpected ${path}`);
  };

  let [candidates] = await apiRegistry.complete('/edgeworkers/v1/ids/4', {}, cache, requestGet);
  assert.deepEqual(candidates, ['/edgeworkers/v1/ids/42']);
  [candidates] = await apiRegistry.complete('/edgeworkers/v1/ids/4', {}, cache, requestGet);
  assert.deepEqual(candidates, ['/edgeworkers/v1/ids/42']);
  assert.equal(calls, 1);

  [candidates] = await apiRegistry.complete('/edgeworkers/v1/ids/42/versions/', {}, cache, requestGet);
  assert.deepEqual(candidates, ['/edgeworkers/v1/ids/42/versions/1', '/edgeworkers/v1/ids/42/versions/2']);
  [candidates] = await apiRegistry.complete('/edgeworkers/v1/ids/42/versions/2', {}, cache, requestGet);
  assert.deepEqual(candidates, ['/edgeworkers/v1/ids/42/versions/2']);
  assert.equal(calls, 2);
});

test('preserves failed completion as a silent no-match', async () => {
  const [candidates] = await apiRegistry.complete('/edgeworkers/v1/ids/4', {}, new Map(),
    async () => ({ statusCode: 403, body: { errors: ['denied'] } }));
  assert.deepEqual(candidates, []);
});
