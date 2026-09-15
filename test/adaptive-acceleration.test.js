'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('discovers Adaptive Acceleration by its documented service prefix', () => {
  const apiModule = apiRegistry.moduleFor('/adaptive-acceleration/v1/properties/123');
  assert.equal(apiModule.name, 'AdaptiveAcceleration');
  assert.equal(apiModule.prefix, '/adaptive-acceleration/v1');
  assert.deepEqual(apiModule.queryParameters, ['accountSwitchKey']);
});

test('routes Adaptive Acceleration GET and POST operations independently', async () => {
  const requests = [];
  const request = async (settings, path, query, body, method) => {
    requests.push({ settings, path, query, body, method });
    return { statusCode: method === 'POST' ? 204 : 200, body: method === 'POST' ? '' : { version: 3 } };
  };

  const report = await apiRegistry.get(
    { edgercSection: 'papi' },
    '/adaptive-acceleration/v1/properties/123',
    {},
    request
  );
  const reset = await apiRegistry.post(
    { edgercSection: 'papi' },
    '/adaptive-acceleration/v1/properties/123/reset',
    {},
    {},
    request
  );

  assert.deepEqual(requests, [
    {
      settings: { edgercSection: 'papi' },
      path: '/properties/123',
      query: {},
      body: undefined,
      method: undefined
    },
    {
      settings: { edgercSection: 'papi' },
      path: '/properties/123/reset',
      query: {},
      body: {},
      method: 'POST'
    }
  ]);
  assert.deepEqual(report, { statusCode: 200, body: { version: 3 } });
  assert.deepEqual(reset, { statusCode: 204, body: '' });
});

test('rejects unsupported Adaptive Acceleration methods and paths', () => {
  assert.throws(
    () => apiRegistry.put(
      {},
      '/adaptive-acceleration/v1/properties/123/reset',
      {},
      {}
    ),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.post(
      {},
      '/adaptive-acceleration/v1/properties/123',
      {},
      {}
    ),
    /No API module supports POST path/
  );
});

test('completes Adaptive Acceleration static paths without dynamic lookups', async () => {
  const [candidates, partial] = await apiRegistry.completeMethod(
    'GET',
    '/adaptive-acceleration/v1/',
    {},
    new Map()
  );
  assert.equal(partial, '/adaptive-acceleration/v1/');
  assert(candidates.includes('/adaptive-acceleration/v1/properties'));

  const [postCandidates, postPartial] = await apiRegistry.completeMethod(
    'POST',
    '/adaptive-acceleration/v1/properties/123/',
    {},
    new Map()
  );
  assert.equal(postPartial, '/adaptive-acceleration/v1/properties/123/');
  assert.deepEqual(postCandidates, [
    '/adaptive-acceleration/v1/properties/123/reset'
  ]);
});
