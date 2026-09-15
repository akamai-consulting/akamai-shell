'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes Network Lists paths using the documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/network-list/v2/network-lists');
  assert.equal(apiModule.name, 'NetworkLists');
  assert.equal(apiModule.prefix, '/network-list/v2');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/network-list/v2/network-lists',
    { extended: true },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { networkLists: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/network-lists',
    query: { extended: true }
  });
  assert.equal(response.statusCode, 200);
});

test('supports only Network Lists methods handled by the generic dispatcher', async () => {
  let request;
  await apiRegistry.put(
    {},
    '/network-list/v2/network-lists/123/details',
    {},
    { name: 'renamed' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 204, body: null };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/network-lists/123/details',
    query: {},
    body: { name: 'renamed' },
    method: 'PUT'
  });
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/network-list/v2/network-lists/123'),
    /No API module supports DELETE path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/network-list/v2/network-lists/123', {}, {}),
    /No API module supports POST path/
  );
});

test('completes Network Lists identifiers from the collection response and caches it', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/network-lists', query: {} });
    return {
      statusCode: 200,
      body: {
        networkLists: [
          { uniqueId: '25614_GENERALLIST' },
          { uniqueId: '1024_AMAZONELASTICCOMPUTECLOU' }
        ]
      }
    };
  };

  const first = await apiRegistry.complete(
    '/network-list/v2/network-lists/256',
    {},
    cache,
    requestGet
  );
  const second = await apiRegistry.complete(
    '/network-list/v2/network-lists/1024',
    {},
    cache,
    requestGet
  );

  assert.deepEqual(first[0], ['/network-list/v2/network-lists/25614_GENERALLIST']);
  assert.deepEqual(second[0], ['/network-list/v2/network-lists/1024_AMAZONELASTICCOMPUTECLOU']);
  assert.equal(calls, 1);
});
