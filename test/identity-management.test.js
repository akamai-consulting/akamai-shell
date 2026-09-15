'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers identity management v3 with its documented service prefix', () => {
  const module = apiRegistry.moduleFor('/identity-management/v3/user-admin/groups');
  assert.equal(module.name, 'IdentityManagement');
  assert.equal(module.prefix, '/identity-management/v3');
  assert(apiRegistry.queryParameters().includes('accountSwitchKey'));
});

test('routes documented identity management methods and preserves responses', async () => {
  let request;
  const requestMethod = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 422, body: { errors: [{ title: 'invalid' }] } };
  };

  const response = await apiRegistry.put(
    {}, '/identity-management/v3/user-admin/groups/123',
    { accountSwitchKey: 'account' }, { groupName: 'renamed' }, requestMethod
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/user-admin/groups/123',
    query: { accountSwitchKey: 'account' },
    body: { groupName: 'renamed' },
    method: 'PUT'
  });
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.body, { errors: [{ title: 'invalid' }] });
  assert.throws(
    () => apiRegistry.post({}, '/identity-management/v3/user-admin/groups/123', {}),
    /POST requires a JSON body/
  );
  assert.throws(
    () => apiRegistry.dispatch('DELETE', {}, '/identity-management/v3/user-admin/groups/123'),
    /No API module supports DELETE path/
  );
});

test('completes identity management group identifiers using a cached collection', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    return { statusCode: 200, body: [{ groupId: 123 }, { groupId: 456 }] };
  };

  let result = await apiRegistry.complete(
    '/identity-management/v3/user-admin/groups/1', {}, cache, requestGet
  );
  assert.deepEqual(result[0], ['/identity-management/v3/user-admin/groups/123']);
  result = await apiRegistry.complete(
    '/identity-management/v3/user-admin/groups/1', {}, cache, requestGet
  );
  assert.deepEqual(result[0], ['/identity-management/v3/user-admin/groups/123']);
  assert.equal(calls.length, 1);
});
