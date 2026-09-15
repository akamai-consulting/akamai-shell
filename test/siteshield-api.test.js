'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers Site Shield using the documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/siteshield/v1/maps');
  assert.equal(apiModule.name, 'SiteShield');
  assert.equal(apiModule.prefix, '/siteshield/v1');
  assert(apiRegistry.queryParameters().includes('accountSwitchKey'));

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/siteshield/v1/maps',
    { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { siteShieldMaps: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/maps',
    query: { accountSwitchKey: 'account' }
  });
  assert.equal(response.statusCode, 200);
});

test('supports the documented acknowledge POST without a request body', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/siteshield/v1/maps/123/acknowledge',
    { accountSwitchKey: 'account' },
    undefined,
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return {
        statusCode: 200,
        body: { id: 123, acknowledged: true }
      };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/maps/123/acknowledge',
    query: { accountSwitchKey: 'account' },
    body: undefined,
    method: 'POST'
  });
  assert.deepEqual(response.body, { id: 123, acknowledged: true });
  assert.throws(
    () => apiRegistry.put({}, '/siteshield/v1/maps/123/acknowledge', {}, {}),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/siteshield/v1/maps/123', {}, {}),
    /No API module supports POST path/
  );
});

test('completes Site Shield map identifiers using a cached collection request', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/maps', query: {} });
    return {
      statusCode: 200,
      body: { siteShieldMaps: [{ id: 123 }, { id: 456 }] }
    };
  };

  const first = await apiRegistry.complete(
    '/siteshield/v1/maps/1',
    {},
    cache,
    requestGet
  );
  const second = await apiRegistry.complete(
    '/siteshield/v1/maps/4',
    {},
    cache,
    requestGet
  );

  assert.deepEqual(first[0], ['/siteshield/v1/maps/123']);
  assert.deepEqual(second[0], ['/siteshield/v1/maps/456']);
  assert.equal(calls, 1);
});

test('preserves Site Shield API error responses and rejects unsupported methods', async () => {
  const errorBody = {
    status: 404,
    title: 'Invalid map id',
    detail: 'Invalid map: 999'
  };
  const response = await apiRegistry.get(
    {},
    '/siteshield/v1/maps/999',
    {},
    async () => ({ statusCode: 404, body: errorBody })
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, errorBody);
  assert.throws(
    () => apiRegistry.post({}, '/siteshield/v1/maps/123', {}, {}),
    /No API module supports POST path/
  );
});
