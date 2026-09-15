'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const netstorageUsage = require('../src/apis/netstorage-usage');

test('discovers NetStorage Usage with its versioned shell prefix', () => {
  assert.equal(apiRegistry.moduleFor('/netstorage-usage/v1/12345').name,
    'NetStorageUsage');
  assert.equal(netstorageUsage.prefix, '/netstorage-usage/v1');
  assert.deepEqual(netstorageUsage.methodPaths, {
    GET: ['/{cpCode}', '/{cpCode}/{path}', '/{cpCode}/{subscriptionName}'],
    PUT: ['/{cpCode}', '/{cpCode}/{pathPrefix}', '/{cpCode}/{path}/{filename}'],
    DELETE: ['/{cpCode}/{subscriptionName}']
  });
});

test('routes documented methods with relative paths and preserves errors', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 403, body: { error: 'denied' } };
  };

  const response = await apiRegistry.put(
    { edgercSection: 'netstorage' },
    '/netstorage-usage/v1/12345/subscriptions',
    { accountSwitchKey: 'ask' },
    { eventTypes: ['created'] },
    handler
  );
  assert.deepEqual(request, {
    settings: { edgercSection: 'netstorage' },
    path: '/12345/subscriptions',
    query: { accountSwitchKey: 'ask' },
    body: { eventTypes: ['created'] },
    method: 'PUT'
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'denied' });

  await apiRegistry.dispatch('DELETE', {}, '/netstorage-usage/v1/12345/subscription-name',
    {}, undefined, handler);
  assert.equal(request.path, '/12345/subscription-name');
  assert.equal(request.method, 'DELETE');
  assert.throws(() => apiRegistry.post({}, '/netstorage-usage/v1/12345', {}, {}),
    /No API module supports POST path/);
});

test('completes event subscription names from the parent collection with caching', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/12345', query: {} });
    return {
      statusCode: 200,
      body: [{ subscriptionName: 'subscr.alpha' }, { subscriptionName: 'subscr.beta' }]
    };
  };

  const first = await netstorageUsage.complete(
    '/netstorage-usage/v1/12345/subscr.a', {}, cache, requestGet
  );
  const second = await netstorageUsage.complete(
    '/netstorage-usage/v1/12345/subscr.b', {}, cache, requestGet
  );
  assert.deepEqual(first[0], ['/netstorage-usage/v1/12345/subscr.alpha']);
  assert.deepEqual(second[0], ['/netstorage-usage/v1/12345/subscr.beta']);
  assert.equal(calls, 1);
});

test('silently returns no completion matches for a failed collection request', async () => {
  const [candidates] = await netstorageUsage.complete(
    '/netstorage-usage/v1/12345/subscr', {}, new Map(),
    async () => ({ statusCode: 403, body: { error: 'denied' } })
  );
  assert.deepEqual(candidates, []);
});
