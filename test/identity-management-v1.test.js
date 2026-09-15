'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes Identity Management v1 paths using the documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/identity-management/v1/open-identities/example/credentials');
  assert.equal(apiModule.name, 'IdentityManagementV1');
  assert.equal(apiModule.prefix, '/identity-management/v1');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/identity-management/v1/open-identities/example/credentials',
    { actions: true },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [] };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/open-identities/example/credentials',
    query: { actions: true }
  });
  assert.equal(response.statusCode, 200);
});

test('supports documented v1 Identity Management methods', async () => {
  let request;
  await apiRegistry.put(
    {},
    '/identity-management/v1/open-identities/example/credentials/123',
    {},
    { status: 'INACTIVE' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, body: {} };
    }
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/open-identities/example/credentials/123',
    query: {},
    body: { status: 'INACTIVE' },
    method: 'PUT'
  });
});

test('completes v1 credential identifiers and caches the collection lookup', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, {
      settings: {},
      path: '/open-identities/example/credentials',
      query: {}
    });
    return { statusCode: 200, body: [{ credentialId: 12345 }, { credentialId: 67890 }] };
  };

  const first = await apiRegistry.complete(
    '/identity-management/v1/open-identities/example/credentials/123',
    {}, cache, requestGet
  );
  const second = await apiRegistry.complete(
    '/identity-management/v1/open-identities/example/credentials/678',
    {}, cache, requestGet
  );
  assert.deepEqual(first[0], [
    '/identity-management/v1/open-identities/example/credentials/12345'
  ]);
  assert.deepEqual(second[0], [
    '/identity-management/v1/open-identities/example/credentials/67890'
  ]);
  assert.equal(calls, 1);
});
