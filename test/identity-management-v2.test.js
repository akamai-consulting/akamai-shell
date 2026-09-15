'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('discovers Identity Management v2 with its documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/identity-management/v2/user-admin/groups');
  assert.equal(apiModule.name, 'IdentityManagementV2');
  assert.equal(apiModule.prefix, '/identity-management/v2');
  assert(apiRegistry.queryParameters().includes('accountSwitchKey'));

  let request;
  const response = await apiRegistry.get({}, '/identity-management/v2/user-admin/groups',
    { accountSwitchKey: '1-ABC' }, async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [] };
    });

  assert.deepEqual(request, {
    settings: {},
    path: '/user-admin/groups',
    query: { accountSwitchKey: '1-ABC' }
  });
  assert.equal(response.statusCode, 200);
});

test('routes documented Identity Management v2 POST and PUT operations', async () => {
  let postRequest;
  await apiRegistry.post({}, '/identity-management/v2/user-admin/groups/move', {},
    { sourceGroupId: 1, destinationGroupId: 2 },
    async (settings, path, query, body, method) => {
      postRequest = { settings, path, query, body, method };
      return { statusCode: 202, body: { accepted: true } };
    });
  assert.deepEqual(postRequest, {
    settings: {},
    path: '/user-admin/groups/move',
    query: {},
    body: { sourceGroupId: 1, destinationGroupId: 2 },
    method: 'POST'
  });

  let putRequest;
  await apiRegistry.put({}, '/identity-management/v2/user-admin/properties/123', {},
    { propertyName: 'updated' },
    async (settings, path, query, body, method) => {
      putRequest = { settings, path, query, body, method };
      return { statusCode: 200, body: { propertyId: 123 } };
    });
  assert.equal(putRequest.path, '/user-admin/properties/123');
  assert.equal(putRequest.method, 'PUT');
});

test('preserves v2 response status and rejects unsupported methods', async () => {
  const error = { statusCode: 403, body: { title: 'Forbidden', detail: 'Not allowed' } };
  const response = await apiRegistry.get({}, '/identity-management/v2/user-profile', {},
    async () => error);
  assert.deepEqual(response, error);
  assert.throws(
    () => apiRegistry.dispatch('DELETE', {}, '/identity-management/v2/user-admin/groups/123', {}, {}),
    /No API module supports DELETE path/
  );
});

test('completes v2 collection identifiers and caches lookups', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/user-admin/groups', query: {} });
    return { statusCode: 200, body: [{ groupId: 12345 }, { groupId: 54321 }] };
  };

  const first = await apiRegistry.complete(
    '/identity-management/v2/user-admin/groups/12', {}, cache, requestGet
  );
  const second = await apiRegistry.complete(
    '/identity-management/v2/user-admin/groups/54', {}, cache, requestGet
  );
  assert.deepEqual(first[0], ['/identity-management/v2/user-admin/groups/12345']);
  assert.deepEqual(second[0], ['/identity-management/v2/user-admin/groups/54321']);
  assert.equal(calls, 1);
});
