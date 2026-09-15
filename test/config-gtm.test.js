'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes Config GTM paths using the documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/config-gtm/v1/domains');
  assert.equal(apiModule.name, 'ConfigGtm');
  assert.equal(apiModule.prefix, '/config-gtm/v1');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/config-gtm/v1/domains',
    { pageSize: 10 },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { items: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/domains',
    query: { pageSize: 10 }
  });
  assert.equal(response.statusCode, 200);
});

test('preserves Config GTM API error status and body', async () => {
  const response = await apiRegistry.get(
    {},
    '/config-gtm/v1/domains/missing.akadns.net',
    {},
    async () => ({
      statusCode: 404,
      body: { title: 'Not Found', detail: 'The domain does not exist' }
    })
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    title: 'Not Found',
    detail: 'The domain does not exist'
  });
});

test('dispatches documented Config GTM POST and PUT methods only', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/config-gtm/v1/domains',
    { gid: 12 },
    { name: 'example.akadns.net' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { accepted: true } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/domains',
    query: { gid: 12 },
    body: { name: 'example.akadns.net' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);
  assert.throws(
    () => apiRegistry.put({}, '/config-gtm/v1/domains', {}, {}),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/config-gtm/v1/domains/example.akadns.net'),
    /No API module supports DELETE path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('PATCH', '/config-gtm/v1/domains/example.akadns.net/properties'),
    /No API module supports PATCH path/
  );
});

test('completes Config GTM domains and nested resources from cached collections', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/domains', query: {} });
    return {
      statusCode: 200,
      body: { items: [{ name: 'example.akadns.net' }, { name: 'demo.akadns.net' }] }
    };
  };

  const first = await apiRegistry.complete(
    '/config-gtm/v1/domains/ex',
    {},
    cache,
    requestGet
  );
  const second = await apiRegistry.complete(
    '/config-gtm/v1/domains/de',
    {},
    cache,
    requestGet
  );

  assert.deepEqual(first[0], ['/config-gtm/v1/domains/example.akadns.net']);
  assert.deepEqual(second[0], ['/config-gtm/v1/domains/demo.akadns.net']);
  assert.equal(calls, 1);
});

test('completes Config GTM property names from their domain collection', async () => {
  let request;
  const [candidates] = await apiRegistry.complete(
    '/config-gtm/v1/domains/example.akadns.net/properties/ww',
    {},
    new Map(),
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { items: [{ name: 'www' }] } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/domains/example.akadns.net/properties',
    query: {}
  });
  assert.deepEqual(candidates, [
    '/config-gtm/v1/domains/example.akadns.net/properties/www'
  ]);
});
