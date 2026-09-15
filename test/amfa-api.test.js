'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const amfa = require('../src/apis/amfa');

test('loads AMFA with its documented service prefix and methods', () => {
  assert.equal(amfa.name, 'AkamaiMFA');
  assert.equal(amfa.prefix, '/amfa/v1');
  assert.deepEqual(amfa.methodPaths.GET, [
    '/groups', '/groups/{groupId}', '/users', '/users/{userId}',
    '/users/{userId}/bypass-codes', '/users/{userId}/bypass-codes/{bypassCodeId}',
    '/users/{userId}/devices'
  ]);
  assert.equal(amfa.methodPaths.POST.length, 11);
  assert.deepEqual(amfa.methodPaths.PUT, ['/users/{userId}']);
  assert(amfa.queryParameters.includes('contractId'));
  assert(amfa.queryParameters.includes('includeDevices'));
});

test('routes AMFA requests through the shared transport boundary', async () => {
  let request;
  const response = await apiRegistry.post(
    { edgerc: 'credentials', edgercSection: 'default' },
    '/amfa/v1/users', { contractId: 'C-123' }, { username: 'example' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 400, headers: { 'x-request-id': 'request' }, body: { detail: 'invalid' } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgerc: 'credentials', edgercSection: 'default' },
    path: '/users',
    query: { contractId: 'C-123' },
    body: { username: 'example' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { detail: 'invalid' });
});

test('rejects AMFA methods and paths outside the documented supported set', () => {
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/amfa/v1/users/user-1'),
    /No API module supports DELETE path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/amfa/v1/users/user-1', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/amfa/v1/users/user-1', {}),
    /PUT requires a JSON body/
  );
});

test('completes AMFA users and devices with cached collection responses', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    if (path === '/users') {
      return { statusCode: 200, body: { users: [{ userId: 'user_alpha' }, { userId: 'user_beta' }] } };
    }
    return {
      statusCode: 200,
      body: { devices: [{ deviceId: 'device_phone' }, { deviceId: 'device_key' }] }
    };
  };

  let result = await apiRegistry.complete('/amfa/v1/users/user_a', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/amfa/v1/users/user_alpha']);
  result = await apiRegistry.complete('/amfa/v1/users/user_a', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/amfa/v1/users/user_alpha']);
  assert.equal(calls.length, 1);

  result = await apiRegistry.complete(
    '/amfa/v1/users/user_alpha/devices/device_', {}, cache, requestGet
  );
  assert.deepEqual(result[0], [
    '/amfa/v1/users/user_alpha/devices/device_phone',
    '/amfa/v1/users/user_alpha/devices/device_key'
  ]);
  assert.equal(calls.length, 2);
});
