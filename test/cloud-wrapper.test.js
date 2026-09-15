'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const cloudWrapper = require('../src/apis/cloud-wrapper');

const PREFIX = '/cloud-wrapper/v1';

test('loads Cloud Wrapper operations from the OpenAPI catalog', () => {
  assert.equal(cloudWrapper.name, 'CloudWrapper');
  assert.equal(cloudWrapper.prefix, PREFIX);
  assert.deepEqual(cloudWrapper.queryParameters.sort(), [
    'accountSwitchKey', 'activate', 'cdnCode', 'contractId', 'contractIds',
    'groupId', 'unused'
  ]);
  assert(cloudWrapper.methodPaths.GET.includes('/capacity'));
  assert(cloudWrapper.methodPaths.POST.includes('/configurations'));
  assert(cloudWrapper.methodPaths.POST.includes('/configurations/activate'));
  assert(cloudWrapper.methodPaths.PUT.includes('/configurations/{configId}'));
  assert(!cloudWrapper.methodPaths.DELETE);
});

test('routes Cloud Wrapper methods with the service prefix and preserves responses', async () => {
  let request;
  const response = await apiRegistry.post({}, `${PREFIX}/configurations`, {
    accountSwitchKey: 'ask'
  }, { configName: 'test' }, async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 202, headers: { location: '/configurations/1' },
      body: { id: 1 } };
  });
  assert.deepEqual(request, {
    settings: {}, path: '/configurations', query: { accountSwitchKey: 'ask' },
    body: { configName: 'test' }, method: 'POST'
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { id: 1 });

  assert.throws(() => apiRegistry.post({}, `${PREFIX}/configurations`, {}),
    /POST requires a JSON body/);
  assert.throws(() => apiRegistry.put({}, `${PREFIX}/configurations/1`, {}),
    /PUT requires a JSON body/);
  assert.throws(() => apiRegistry.post({}, `${PREFIX}/capacity`, {}, {}),
    /No API module supports POST path/);
});

test('completes Cloud Wrapper configuration and property identifiers with caching', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual(query, {});
    if (path === '/configurations') {
      return { statusCode: 200, body: { configurations: [{ id: 12 }, { id: 34 }] } };
    }
    if (path === '/properties') {
      return { statusCode: 200, body: { properties: [{ propertyId: 123 }, { propertyId: 456 }] } };
    }
    throw new Error(`unexpected ${path}`);
  };

  let [candidates] = await apiRegistry.complete(`${PREFIX}/configurations/1`, {},
    cache, requestGet);
  assert.deepEqual(candidates, [`${PREFIX}/configurations/12`]);
  [candidates] = await apiRegistry.complete(`${PREFIX}/configurations/1`, {},
    cache, requestGet);
  assert.deepEqual(candidates, [`${PREFIX}/configurations/12`]);
  assert.equal(calls, 1);

  [candidates] = await apiRegistry.complete(`${PREFIX}/properties/12`, {},
    new Map(), requestGet);
  assert.deepEqual(candidates, [`${PREFIX}/properties/123`]);
  assert.equal(calls, 2);
});
