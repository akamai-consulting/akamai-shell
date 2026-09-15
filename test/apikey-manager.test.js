'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const apiKeyManager = require('../src/apis/apikey-manager');

test('discovers API Key Manager by its documented service prefix', () => {
  assert.equal(apiRegistry.moduleFor('/apikey-manager-api/v1/collections').name,
    'ApiKeyManager');
  assert.equal(apiKeyManager.prefix, '/apikey-manager-api/v1');
  assert.equal(apiKeyManager.methodPaths.DELETE, undefined);
});

test('routes documented methods without changing the API prefix', async () => {
  let request;
  const response = await apiRegistry.put(
    {},
    '/apikey-manager-api/v1/collections/108051',
    { accountSwitchKey: 'account' },
    { name: 'Updated' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, body: { updated: true } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/collections/108051',
    query: { accountSwitchKey: 'account' },
    body: { name: 'Updated' },
    method: 'PUT'
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { updated: true });
});

test('rejects unsupported methods and paths explicitly', () => {
  assert.throws(
    () => apiRegistry.moduleForMethod('PATCH', '/apikey-manager-api/v1/keys/1'),
    /No API module supports PATCH path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('GET', '/apikey-manager-api/v1/unknown'),
    /No API module supports GET path/
  );
});

test('completes collection, counter, and key identifiers with cached lookups', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    if (path === '/collections') {
      return { statusCode: 200, body: [{ id: 108051 }, { id: 208052 }] };
    }
    throw new Error(`unexpected completion path ${path}`);
  };

  const first = await apiKeyManager.complete(
    '/apikey-manager-api/v1/collections/10', {}, cache, requestGet
  );
  const second = await apiKeyManager.complete(
    '/apikey-manager-api/v1/collections/10', {}, cache, requestGet
  );

  assert.deepEqual(first[0], ['/apikey-manager-api/v1/collections/108051']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});

test('preserves API error responses from method dispatch', async () => {
  const response = await apiRegistry.dispatch(
    'PUT',
    {},
    '/apikey-manager-api/v1/counters/61',
    {},
    { enabled: false },
    async (settings, path, query, body, method) => ({
      statusCode: 409,
      headers: { 'content-type': 'application/json' },
      body: { title: 'Conflict', detail: 'Counter is in use' }
    })
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, { title: 'Conflict', detail: 'Counter is in use' });
  assert.throws(
    () => apiRegistry.dispatch('DELETE', {}, '/apikey-manager-api/v1/counters/61'),
    /No API module supports DELETE path/
  );
});
