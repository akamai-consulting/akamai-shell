'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers and routes AppSec API paths', async () => {
  const module = apiRegistry.moduleFor('/appsec/v1/configs');
  assert.equal(module.name, 'AppSec');
  assert.equal(module.prefix, '/appsec/v1');

  let request;
  await apiRegistry.get({}, '/appsec/v1/configs', { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { configurations: [] } };
    });
  assert.deepEqual(request, {
    settings: {},
    path: '/configs',
    query: { accountSwitchKey: 'account' }
  });
});

test('dispatches documented AppSec POST and PUT methods only', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 201, body: { configId: 7 } };
  };

  const response = await apiRegistry.post(
    {}, '/appsec/v1/configs', { accountSwitchKey: 'account' },
    { name: 'test' }, handler
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/configs',
    query: { accountSwitchKey: 'account' },
    body: { name: 'test' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);

  await apiRegistry.put({}, '/appsec/v1/configs/7', {}, { name: 'updated' }, handler);
  assert.equal(request.method, 'PUT');
  assert.equal(request.path, '/configs/7');
  assert.throws(
    () => apiRegistry.post({}, '/appsec/v1/configs/7/versions/1', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/appsec/v1/configs/7', {}),
    /PUT requires a JSON body/
  );
});

test('completes AppSec dynamic identifiers using cached collection requests', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    if (path === '/configs') {
      return { statusCode: 200, body: { configurations: [{ id: 123 }, { id: 456 }] } };
    }
    return {
      statusCode: 200,
      body: { versionList: [{ version: 1 }, { version: 12 }, { version: 2 }] }
    };
  };

  let result = await apiRegistry.complete('/appsec/v1/configs/1', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/appsec/v1/configs/123']);
  result = await apiRegistry.complete('/appsec/v1/configs/1', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/appsec/v1/configs/123']);
  assert.equal(calls.length, 1);

  result = await apiRegistry.complete(
    '/appsec/v1/configs/123/versions/1', {}, cache, requestGet
  );
  assert.deepEqual(result[0], [
    '/appsec/v1/configs/123/versions/1',
    '/appsec/v1/configs/123/versions/12'
  ]);
  assert.equal(calls.length, 2);
});
