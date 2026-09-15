'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers Test Management by its documented service prefix', () => {
  const module = apiRegistry.moduleFor('/test-management/v3/functional/test-suites');
  assert.equal(module.name, 'TestManagement');
  assert.equal(module.prefix, '/test-management/v3');
  assert(apiRegistry.queryParameters().includes('accountSwitchKey'));
});

test('routes supported Test Management methods without changing their paths', async () => {
  for (const method of ['GET', 'POST', 'PUT']) {
    let request;
    const path = method === 'GET'
      ? '/test-management/v3/test-runs'
      : method === 'POST'
        ? '/test-management/v3/functional/test-suites'
        : '/test-management/v3/functional/test-suites/1';
    const body = method === 'GET' ? undefined : { testSuiteName: 'example' };
    const response = await apiRegistry.dispatch(
      method,
      { marker: true },
      path,
      { accountSwitchKey: 'acct' },
      body,
      async (settings, relativePath, query, requestBody, requestMethod) => {
        request = { settings, relativePath, query, requestBody, requestMethod };
        return { statusCode: method === 'GET' ? 200 : 201, body: { ok: true } };
      }
    );
    assert.deepEqual(request, {
      settings: { marker: true },
      relativePath: path.replace('/test-management/v3', ''),
      query: { accountSwitchKey: 'acct' },
      requestBody: body,
      requestMethod: method === 'GET' ? undefined : method
    });
    assert.equal(response.statusCode, method === 'GET' ? 200 : 201);
  }
});

test('rejects unsupported methods and missing write bodies', () => {
  assert.throws(
    () => apiRegistry.put({}, '/test-management/v3/functional/test-suites/1', {}),
    /PUT requires a JSON body/
  );
  assert.throws(
    () => apiRegistry.post({}, '/test-management/v3/test-runs/1', {}, { ok: true }),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.dispatch('DELETE', {}, '/test-management/v3/functional/test-suites/1', {}, {}),
    /No API module supports DELETE path/
  );
});

test('completes Test Management collection identifiers through cached lookups', async () => {
  const cache = new Map();
  let calls = 0;
  const request = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/functional/test-suites', query: {} });
    return {
      statusCode: 200,
      body: { testSuites: [{ testSuiteId: 284 }, { testSuiteId: 301 }] }
    };
  };

  const first = await apiRegistry.complete(
    '/test-management/v3/functional/test-suites/2', {}, cache, request
  );
  const second = await apiRegistry.complete(
    '/test-management/v3/functional/test-suites/2', {}, cache, request
  );
  assert.deepEqual(first[0], ['/test-management/v3/functional/test-suites/284']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(calls, 1);
});
