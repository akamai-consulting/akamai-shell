'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes ETP Config paths using the documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/etp-config/v3/configs/all');
  assert.equal(apiModule.name, 'EtpConfig');
  assert.equal(apiModule.prefix, '/etp-config/v3');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/etp-config/v3/configs/all',
    { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [{ id: 42 }] };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/configs/all',
    query: { accountSwitchKey: 'account' }
  });
  assert.deepEqual(response.body, [{ id: 42 }]);
});

test('dispatches only documented ETP Config POST and PUT paths', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 202, body: { accepted: true } };
  };

  const response = await apiRegistry.post(
    {},
    '/etp-config/v3/configs/123/policies',
    { accountSwitchKey: 'account' },
    { name: 'policy' },
    handler
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/configs/123/policies',
    query: { accountSwitchKey: 'account' },
    body: { name: 'policy' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);

  await apiRegistry.put(
    {},
    '/etp-config/v3/configs/123/policies/456',
    {},
    { name: 'updated' },
    handler
  );
  assert.equal(request.path, '/configs/123/policies/456');
  assert.equal(request.method, 'PUT');

  assert.throws(
    () => apiRegistry.post({}, '/etp-config/v3/configs/123/policies/456', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/etp-config/v3/configs/123/policies/456'),
    /No API module supports DELETE path/
  );
});

test('preserves ETP Config API error status and body', async () => {
  const response = await apiRegistry.get(
    {},
    '/etp-config/v3/configs/123/policies',
    {},
    async () => ({
      statusCode: 403,
      body: { title: 'Forbidden', detail: 'Access denied' }
    })
  );
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { title: 'Forbidden', detail: 'Access denied' });
});

test('completes ETP Config identifiers from cached collection requests', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    if (path === '/configs/all') {
      return { statusCode: 200, body: [{ id: 123 }, { id: 456 }] };
    }
    return { statusCode: 200, body: [{ id: 789 }, { id: 790 }] };
  };

  let result = await apiRegistry.complete(
    '/etp-config/v3/configs/1',
    {},
    cache,
    requestGet
  );
  assert.deepEqual(result[0], ['/etp-config/v3/configs/123']);

  result = await apiRegistry.complete(
    '/etp-config/v3/configs/123/policies/7',
    {},
    cache,
    requestGet
  );
  assert.deepEqual(result[0], [
    '/etp-config/v3/configs/123/policies/789',
    '/etp-config/v3/configs/123/policies/790'
  ]);
  assert.equal(calls.length, 2);

  await apiRegistry.complete('/etp-config/v3/configs/4', {}, cache, requestGet);
  assert.equal(calls.length, 2);
});
