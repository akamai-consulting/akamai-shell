'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes SIEM requests with the documented /siem/v1 prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/siem/v1/configs/12892');
  assert.equal(apiModule.name, 'SIEM');
  assert.equal(apiModule.prefix, '/siem/v1');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/siem/v1/configs/12892',
    { from: 100, to: 200, limit: 10 },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [{ event: 'blocked' }] };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/configs/12892',
    query: { from: 100, to: 200, limit: 10 }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, [{ event: 'blocked' }]);
});

test('exposes SIEM query parameters from the OpenAPI catalog', () => {
  const apiModule = apiRegistry.moduleFor('/siem/v1/configs/12892');
  assert.deepEqual(apiModule.queryParameters.sort(), ['from', 'limit', 'offset', 'to']);
});

test('preserves SIEM API error responses', async () => {
  const response = await apiRegistry.get(
    {},
    '/siem/v1/configs/12892',
    {},
    async () => ({
      statusCode: 416,
      body: { title: 'Requested range not satisfiable' }
    })
  );

  assert.equal(response.statusCode, 416);
  assert.deepEqual(response.body, { title: 'Requested range not satisfiable' });
});

test('rejects methods not documented by SIEM', () => {
  assert.throws(
    () => apiRegistry.moduleForMethod('POST', '/siem/v1/configs/12892'),
    /No API module supports POST path/
  );
});
