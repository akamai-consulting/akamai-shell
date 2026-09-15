'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const sandboxApi = require('../src/apis/sandbox-api');

test('discovers Sandbox API with its documented prefix and methods', () => {
  assert.equal(sandboxApi.prefix, '/sandbox-api/v1');
  assert.equal(apiRegistry.moduleFor('/sandbox-api/v1/sandboxes').name, 'SandboxApi');
  assert(apiRegistry.modulesForMethod('GET', '/sandbox-api/v1/sandboxes').includes(sandboxApi));
  assert(apiRegistry.modulesForMethod('POST', '/sandbox-api/v1/sandboxes').includes(sandboxApi));
  assert(apiRegistry.modulesForMethod('PUT', '/sandbox-api/v1/sandboxes/abc').includes(sandboxApi));
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/sandbox-api/v1/sandboxes/abc'),
    /No API module supports DELETE path/
  );
});

test('routes Sandbox API method, path, query, and body', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/sandbox-api/v1/sandboxes/abc/clone',
    { accountSwitchKey: 'account' },
    { name: 'copy' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { sandboxId: 'new-id' } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/sandboxes/abc/clone',
    query: { accountSwitchKey: 'account' },
    body: { name: 'copy' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { sandboxId: 'new-id' });
});

test('completes sandbox and property identifiers with cached collection requests', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    if (path === '/sandboxes') {
      return { statusCode: 200, body: { sandboxes: [{ sandboxId: 'abc' }, { sandboxId: 'def' }] } };
    }
    if (path === '/sandboxes/abc/properties') {
      return { statusCode: 200, body: { properties: [{ sandboxPropertyId: 'prop-1' }] } };
    }
    throw new Error(`unexpected completion path ${path}`);
  };

  const first = await sandboxApi.complete(
    '/sandbox-api/v1/sandboxes/a', {}, cache, requestGet
  );
  const second = await sandboxApi.complete(
    '/sandbox-api/v1/sandboxes/a', {}, cache, requestGet
  );
  const properties = await sandboxApi.complete(
    '/sandbox-api/v1/sandboxes/abc/properties/p', {}, cache, requestGet
  );

  assert.deepEqual(first[0], ['/sandbox-api/v1/sandboxes/abc']);
  assert.deepEqual(second[0], first[0]);
  assert.deepEqual(properties[0], [
    '/sandbox-api/v1/sandboxes/abc/properties/prop-1'
  ]);
  assert.equal(requests, 2);
});
