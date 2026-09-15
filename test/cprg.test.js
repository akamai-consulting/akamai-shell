'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes CPRG requests with the documented /cprg/v1 prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/cprg/v1/cpcodes');
  assert.equal(apiModule.name, 'CPResourceGroups');
  assert.equal(apiModule.prefix, '/cprg/v1');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/cprg/v1/cpcodes',
    { contractId: 'C-123' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { cpcodes: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/cpcodes',
    query: { contractId: 'C-123' }
  });
  assert.equal(response.statusCode, 200);
});

test('supports only documented CPRG GET, POST, and PUT operations', async () => {
  let request;
  await apiRegistry.put(
    {},
    '/cprg/v1/cpcodes/123',
    {},
    { cpcodeName: 'renamed' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, body: { cpcodeId: 123 } };
    }
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/cpcodes/123',
    query: {},
    body: { cpcodeName: 'renamed' },
    method: 'PUT'
  });
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/cprg/v1/reporting-groups/123'),
    /No API module supports DELETE path/
  );
});

test('completes CPRG identifiers using cached collection lookups', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/cpcodes', query: {} });
    return {
      statusCode: 200,
      body: { cpcodes: [{ cpcodeId: 1234567 }, { cpcodeId: 7654321 }] }
    };
  };

  const first = await apiRegistry.complete('/cprg/v1/cpcodes/123', {}, cache, requestGet);
  const second = await apiRegistry.complete('/cprg/v1/cpcodes/765', {}, cache, requestGet);
  assert.deepEqual(first[0], ['/cprg/v1/cpcodes/1234567']);
  assert.deepEqual(second[0], ['/cprg/v1/cpcodes/7654321']);
  assert.equal(calls, 1);
});

test('preserves API error responses from CPRG requests', async () => {
  const response = await apiRegistry.get(
    {},
    '/cprg/v1/reporting-groups',
    {},
    async () => ({
      statusCode: 400,
      body: { problem: 'invalid request' }
    })
  );
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { problem: 'invalid request' });
});
