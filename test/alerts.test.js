'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes Alerts through the documented /alerts/v2 prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/alerts/v2/alert-definitions');
  assert.equal(apiModule.name, 'Alerts');
  assert.equal(apiModule.prefix, '/alerts/v2');
  assert(apiModule.queryParameters.includes('includeGroupInformation'));

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/alerts/v2/alert-definitions',
    { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { data: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/alert-definitions',
    query: { accountSwitchKey: 'account' }
  });
  assert.equal(response.statusCode, 200);
});

test('supports only Alerts methods handled by the generic dispatcher', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/alerts/v2/alert-definitions',
    {},
    { fields: { name: 'example' } },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { definitionId: 's@123' } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/alert-definitions',
    query: {},
    body: { fields: { name: 'example' } },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);

  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/alerts/v2/alert-definitions/s@123'),
    /No API module supports DELETE path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/alerts/v2/alert-definitions', {}),
    /POST requires a JSON body/
  );
});

test('completes and caches Alert definition identifiers', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/alert-definitions', query: {} });
    return {
      statusCode: 200,
      body: { data: [{ definitionId: 's@123' }, { definitionId: 'x@456' }] }
    };
  };

  const first = await apiRegistry.complete(
    '/alerts/v2/alert-definitions/s@',
    {},
    cache,
    requestGet
  );
  const second = await apiRegistry.complete(
    '/alerts/v2/alert-definitions/x@',
    {},
    cache,
    requestGet
  );

  assert.deepEqual(first[0], ['/alerts/v2/alert-definitions/s@123']);
  assert.deepEqual(second[0], ['/alerts/v2/alert-definitions/x@456']);
  assert.equal(calls, 1);
});

test('preserves Alerts API error responses', async () => {
  const errorBody = { title: 'Invalid request', status: 400 };
  const response = await apiRegistry.get(
    {},
    '/alerts/v2/alert-definitions',
    {},
    async () => ({ statusCode: 400, body: errorBody })
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, errorBody);
});
