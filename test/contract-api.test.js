'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const contractApi = require('../src/apis/contract-api');

test('discovers Contract API v1 with its documented GET paths', () => {
  assert.equal(contractApi.prefix, '/contract-api/v1');
  assert.equal(contractApi.supports('/contract-api/v1/contracts/identifiers'), true);
  assert.equal(contractApi.supportsMethod(
    'GET',
    '/contract-api/v1/reportingGroups/identifiers'
  ), true);
  assert.equal(contractApi.supportsMethod(
    'POST',
    '/contract-api/v1/contracts/identifiers'
  ), false);
  assert.equal(contractApi.supportsMethod(
    'GET',
    '/contract-api/v1/contracts/unknown'
  ), false);
  assert.deepEqual(contractApi.queryParameters.sort(), ['depth', 'from', 'to']);
});

test('routes Contract API requests without rewriting paths or methods', async () => {
  const calls = [];
  const result = await contractApi.get(
    { edgerc: '~/.edgerc', edgercSection: 'papi' },
    '/contract-api/v1/contracts/ABC/products/summaries',
    { from: '2024-01-01' },
    async (settings, apiPath, query) => {
      calls.push({ settings, apiPath, query });
      return { status: 206, body: { products: [] }, headers: {} };
    }
  );

  assert.equal(result.status, 206);
  assert.deepEqual(calls[0], {
    settings: { edgerc: '~/.edgerc', edgercSection: 'papi' },
    apiPath: '/contracts/ABC/products/summaries',
    query: { from: '2024-01-01' }
  });
});

test('preserves Contract API error status and body', async () => {
  const error = {
    type: '/contract-api/v1/error-types/E404',
    title: 'Not found',
    status: 404
  };
  const result = await contractApi.get(
    {},
    '/contract-api/v1/reportingGroups/999/products/summaries',
    {},
    async () => ({ status: 404, body: error, headers: { 'content-type': 'application/problem+json' } })
  );

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, error);
});

test('completes contract and reporting-group identifiers using cached collections', async () => {
  const calls = [];
  const cache = new Map();
  const request = async (settings, apiPath) => {
    calls.push(apiPath);
    if (apiPath === '/contracts/identifiers') {
      return { status: 200, body: ['ABC-1', 'XYZ-2'] };
    }
    return { status: 200, body: [101, 202] };
  };

  assert.deepEqual(
    (await contractApi.complete(
      '/contract-api/v1/contracts/A',
      {},
      cache,
      request
    ))[0],
    ['/contract-api/v1/contracts/ABC-1']
  );
  assert.deepEqual(
    (await contractApi.complete(
      '/contract-api/v1/contracts/A',
      {},
      cache,
      request
    ))[0],
    ['/contract-api/v1/contracts/ABC-1']
  );
  assert.deepEqual(
    (await contractApi.complete(
      '/contract-api/v1/reportingGroups/1',
      {},
      cache,
      request
    ))[0],
    ['/contract-api/v1/reportingGroups/101']
  );
  assert.deepEqual(calls, ['/contracts/identifiers', '/reportingGroups/identifiers']);
});
