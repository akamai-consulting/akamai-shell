'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const gtmApi = require('../src/apis/gtm-api');

test('discovers GTM API with its documented reports prefix and GET methods', async () => {
  assert.equal(apiRegistry.moduleFor('/gtm-api/v1/reports/domain-list').name, 'GtmApi');
  assert(apiRegistry.modulesForMethod('GET', '/gtm-api/v1/reports/domain-list').includes(gtmApi));
  assert.equal(apiRegistry.modulesForMethod('POST', '/gtm-api/v1/reports/domain-list').length, 0);
  assert.throws(
    () => apiRegistry.moduleForMethod('POST', '/gtm-api/v1/reports/domain-list'),
    /No API module supports POST path/
  );
});

test('routes GTM requests using the OpenAPI path and query parameters', async () => {
  let request;
  const response = await apiRegistry.get(
    { accountSwitchKey: 'account' },
    '/gtm-api/v1/reports/traffic/domains/example.akadns.net/properties/www',
    { start: '2024-01-01T00:00:00Z' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { report: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: { accountSwitchKey: 'account' },
    path: '/traffic/domains/example.akadns.net/properties/www',
    query: { start: '2024-01-01T00:00:00Z' }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { report: [] });
});

test('completes GTM domains through the authenticated collection request and caches it', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    assert.equal(path, '/domain-list');
    return {
      statusCode: 200,
      body: { domains: ['example.akadns.net', 'other.akadns.net'] }
    };
  };

  const first = await gtmApi.complete(
    '/gtm-api/v1/reports/domain-list/e', {}, cache, requestGet
  );
  const second = await gtmApi.complete(
    '/gtm-api/v1/reports/domain-list/e', {}, cache, requestGet
  );

  assert.deepEqual(first[0], ['/gtm-api/v1/reports/domain-list/example.akadns.net']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});

test('completes properties from a GTM domain summary', async () => {
  const [candidates] = await gtmApi.complete(
    '/gtm-api/v1/reports/domain-list/example.akadns.net/properties/w',
    {},
    new Map(),
    async (settings, path) => {
      assert.equal(path, '/domain-list/example.akadns.net');
      return { statusCode: 200, body: { properties: ['www', 'wildcard'] } };
    }
  );

  assert.deepEqual(candidates, [
    '/gtm-api/v1/reports/domain-list/example.akadns.net/properties/www',
    '/gtm-api/v1/reports/domain-list/example.akadns.net/properties/wildcard'
  ]);
});
