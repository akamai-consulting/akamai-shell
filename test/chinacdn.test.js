'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const chinacdn = require('../src/apis/chinacdn');

const PREFIX = '/chinacdn/v1';

test('loads China CDN operations and the documented service prefix', () => {
  assert.equal(chinacdn.name, 'ChinaCDN');
  assert.equal(chinacdn.prefix, PREFIX);
  assert.deepEqual(chinacdn.queryParameters, [
    'provisionState', 'accountSwitchKey', 'groupId', 'forceDeprovision'
  ]);
  assert.equal(chinacdn.methodPaths.GET.length, 10);
  assert.equal(chinacdn.methodPaths.POST.length, 1);
  assert.equal(chinacdn.methodPaths.PUT.length, 2);
  assert.equal(chinacdn.methodPaths.PATCH, undefined);
  assert.equal(chinacdn.methodPaths.DELETE, undefined);
});

test('routes documented China CDN methods without changing response status or body', async () => {
  const requests = [];
  const request = async (settings, path, query, body, method) => {
    requests.push({ settings, path, query, body, method });
    return {
      statusCode: body === undefined ? 200 : 202,
      headers: { 'x-request-id': 'request-1' },
      body: { detail: 'preserved' }
    };
  };

  const response = await apiRegistry.get({}, `${PREFIX}/groups`, { accountSwitchKey: 'account' }, request);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { detail: 'preserved' });
  await apiRegistry.put({}, `${PREFIX}/property-hostnames/example.test`, {}, {
    icpNumberId: 7
  }, request);
  await apiRegistry.post({}, `${PREFIX}/property-hostnames/example.test/provision-state-changes`, {}, {
    targetState: 'PROVISIONED'
  }, request);

  assert.deepEqual(requests, [
    {
      settings: {}, path: '/groups', query: { accountSwitchKey: 'account' },
      body: undefined, method: undefined
    },
    {
      settings: {}, path: '/property-hostnames/example.test', query: {},
      body: { icpNumberId: 7 }, method: 'PUT'
    },
    {
      settings: {}, path: '/property-hostnames/example.test/provision-state-changes', query: {},
      body: { targetState: 'PROVISIONED' }, method: 'POST'
    }
  ]);
});

test('rejects unsupported China CDN methods and completes dynamic identifiers', async () => {
  assert.throws(
    () => apiRegistry.post({}, `${PREFIX}/groups`, {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, `${PREFIX}/groups`, {}, {}),
    /No API module supports PUT path/
  );

  const cache = new Map();
  const calls = [];
  const request = async (settings, path, query) => {
    calls.push({ settings, path, query });
    if (path === '/property-hostnames') {
      return { statusCode: 200, body: { propertyHostnames: [{ hostname: 'example.test' }] } };
    }
    return {
      statusCode: 200,
      body: {
        provisionStateChanges: [{ id: 12 }, { id: 123 }]
      }
    };
  };

  let result = await apiRegistry.complete(`${PREFIX}/property-hostnames/ex`, {}, cache, request);
  assert.deepEqual(result[0], [`${PREFIX}/property-hostnames/example.test`]);
  result = await apiRegistry.complete(
    `${PREFIX}/property-hostnames/example.test/provision-state-changes/1`,
    {}, cache, request
  );
  assert.deepEqual(result[0], [
    `${PREFIX}/property-hostnames/example.test/provision-state-changes/12`,
    `${PREFIX}/property-hostnames/example.test/provision-state-changes/123`
  ]);
  assert.deepEqual(calls, [
    { settings: {}, path: '/property-hostnames', query: {} },
    {
      settings: {},
      path: '/property-hostnames/example.test/provision-state-changes',
      query: {}
    }
  ]);
});
