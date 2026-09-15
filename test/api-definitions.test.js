'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers and routes API Definitions v2 by its documented service prefix', async () => {
  const module = apiRegistry.moduleFor('/api-definitions/v2/endpoints');
  assert.equal(module.name, 'ApiDefinitions');
  assert.equal(module.prefix, '/api-definitions/v2');

  let request;
  await apiRegistry.get({}, '/api-definitions/v2/endpoints', { contractId: 'C-1' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { apiEndPoints: [] } };
    });
  assert.deepEqual(request, {
    settings: {},
    path: '/endpoints',
    query: { contractId: 'C-1' }
  });
});

test('dispatches only documented generic write methods', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 201, body: { created: true } };
  };

  await apiRegistry.post({}, '/api-definitions/v2/categories', {}, { apiCategoryName: 'Test' }, handler);
  assert.equal(request.method, 'POST');
  assert.equal(request.path, '/categories');

  await apiRegistry.put({}, '/api-definitions/v2/categories/12', {}, { apiCategoryName: 'Updated' }, handler);
  assert.equal(request.method, 'PUT');
  assert.equal(request.path, '/categories/12');

  assert.throws(
    () => apiRegistry.post({}, '/api-definitions/v2/categories/12', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/api-definitions/v2/endpoints/1/versions/2/activate', {}, {}),
    /No API module supports PUT path/
  );
});

test('completes API Definitions endpoint and version identifiers from collection responses', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path) => {
    calls.push(path);
    if (path === '/endpoints') {
      return { statusCode: 200, body: { apiEndPoints: [{ apiEndPointId: 12 }, { apiEndPointId: 34 }] } };
    }
    return { statusCode: 200, body: { apiVersions: [{ versionNumber: 1 }, { versionNumber: 12 }] } };
  };

  let result = await apiRegistry.complete('/api-definitions/v2/endpoints/1', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/api-definitions/v2/endpoints/12']);
  result = await apiRegistry.complete('/api-definitions/v2/endpoints/12/versions/1', {}, cache, requestGet);
  assert.deepEqual(result[0], [
    '/api-definitions/v2/endpoints/12/versions/1',
    '/api-definitions/v2/endpoints/12/versions/12'
  ]);
  assert.deepEqual(calls, ['/endpoints', '/endpoints/12/versions']);
});
