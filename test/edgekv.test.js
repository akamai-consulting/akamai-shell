'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const edgekv = require('../src/apis/edgekv');

test('discovers EdgeKV and exposes only supported documented methods', async () => {
  assert.equal(apiRegistry.moduleFor('/edgekv/v1/tokens').name, 'EdgeKV');
  assert(apiRegistry.modulesForMethod('GET', '/edgekv/v1/tokens').includes(edgekv));
  assert(apiRegistry.modulesForMethod('POST', '/edgekv/v1/tokens').includes(edgekv));
  assert(apiRegistry.modulesForMethod('PUT', '/edgekv/v1/initialize').includes(edgekv));
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/edgekv/v1/tokens'),
    /No API module supports DELETE path/
  );
});

test('routes EdgeKV method, path, query, and body without changing the API prefix', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/edgekv/v1/networks/production/namespaces',
    { accountSwitchKey: 'account' },
    { namespace: 'catalog' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { created: true } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/networks/production/namespaces',
    query: { accountSwitchKey: 'account' },
    body: { namespace: 'catalog' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, { created: true });
});

test('completes EdgeKV collection identifiers and caches the lookup', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    if (path === '/tokens') {
      return { statusCode: 200, body: { tokens: [{ name: 'alpha' }, { name: 'beta' }] } };
    }
    throw new Error(`unexpected completion path ${path}`);
  };

  const first = await edgekv.complete(
    '/edgekv/v1/tokens/a', {}, cache, requestGet
  );
  const second = await edgekv.complete(
    '/edgekv/v1/tokens/a', {}, cache, requestGet
  );

  assert.deepEqual(first[0], ['/edgekv/v1/tokens/alpha']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});

test('completes primitive EdgeKV item identifiers', async () => {
  const [candidates] = await edgekv.complete(
    '/edgekv/v1/networks/production/namespaces/catalog/groups/42/items/U',
    {},
    new Map(),
    async () => ({ statusCode: 200, body: ['US', 'DE'] })
  );
  assert.deepEqual(candidates, [
    '/edgekv/v1/networks/production/namespaces/catalog/groups/42/items/US'
  ]);
});
