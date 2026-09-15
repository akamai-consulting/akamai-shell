'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers SLA API with its documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/sla-api/v1/tests');
  assert.equal(apiModule.name, 'SlaApi');
  assert.equal(apiModule.prefix, '/sla-api/v1');
  assert(apiModule.methodPaths.GET.includes('/tests/{slaTestId}'));
  assert(apiModule.methodPaths.POST.includes('/tests'));
  assert(apiRegistry.queryParameters().includes('slaTestIds'));
  assert(apiRegistry.queryParameters().includes('start'));

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/sla-api/v1/tests',
    { slaTestIds: '82' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 206, body: { partial: true } };
    }
  );
  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/tests',
    query: { slaTestIds: '82' }
  });
  assert.deepEqual(response, { statusCode: 206, body: { partial: true } });
});

test('dispatches only the supported SLA API methods and preserves responses', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 409, headers: { 'x-test': 'conflict' }, body: { error: 'exists' } };
  };

  const response = await apiRegistry.post(
    {}, '/sla-api/v1/tests', { accountSwitchKey: 'account' },
    { name: 'test' }, handler
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/tests',
    query: { accountSwitchKey: 'account' },
    body: { name: 'test' },
    method: 'POST'
  });
  assert.deepEqual(response, {
    statusCode: 409,
    headers: { 'x-test': 'conflict' },
    body: { error: 'exists' }
  });

  await apiRegistry.put({}, '/sla-api/v1/tests/82', {}, { name: 'updated' }, handler);
  assert.equal(request.method, 'PUT');
  assert.equal(request.path, '/tests/82');
  assert.throws(
    () => apiRegistry.post({}, '/sla-api/v1/tests/82', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/sla-api/v1/tests/82'),
    /PUT requires a JSON body/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/sla-api/v1/tests/82'),
    /No API module supports DELETE path/
  );
});

test('completes SLA test identifiers with a cached collection lookup', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/tests', query: {} });
    return {
      statusCode: 200,
      body: [{ slaTestId: 82 }, { slaTestId: 830 }, { slaTestId: 91 }]
    };
  };

  const first = await apiRegistry.complete('/sla-api/v1/tests/8', {}, cache, requestGet);
  const second = await apiRegistry.complete('/sla-api/v1/tests/83', {}, cache, requestGet);
  assert.deepEqual(first[0], ['/sla-api/v1/tests/82', '/sla-api/v1/tests/830']);
  assert.deepEqual(second[0], ['/sla-api/v1/tests/830']);
  assert.equal(calls, 1);
});
