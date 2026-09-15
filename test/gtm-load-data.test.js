'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const gtmLoadData = require('../src/apis/gtm-load-data');

const PREFIX = '/gtm-load-data/v1';
const PATH = `${PREFIX}/example.akadns.net/connections/100`;

test('loads GTM Load Data operations from the OpenAPI catalog', () => {
  assert.equal(gtmLoadData.name, 'GTM Load Data');
  assert.equal(gtmLoadData.prefix, PREFIX);
  assert.deepEqual(gtmLoadData.queryParameters, ['accountSwitchKey']);
  assert.deepEqual(gtmLoadData.methodPaths.GET, ['/{domain}/{resource}/{datacenterId}']);
  assert.deepEqual(gtmLoadData.methodPaths.POST, ['/{domain}/{resource}/{datacenterId}']);
  assert(apiRegistry.modulesForMethod('GET', PATH).includes(gtmLoadData));
  assert(apiRegistry.modulesForMethod('POST', PATH).includes(gtmLoadData));
});

test('routes GTM Load Data GET requests through the shared transport boundary', async () => {
  let request;
  const response = await apiRegistry.get(
    { edgerc: 'credentials', edgercSection: 'default' },
    PATH,
    { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { load: 42 }
      };
    }
  );

  assert.deepEqual(request, {
    settings: { edgerc: 'credentials', edgercSection: 'default' },
    path: '/example.akadns.net/connections/100',
    query: { accountSwitchKey: 'account' }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { load: 42 });
});

test('routes GTM Load Data POST requests and preserves API error responses', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    PATH,
    {},
    { timestamp: '2020-01-01T00:00:00Z', load: 42 },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/problem+json' },
        body: { title: 'Bad Request', status: 400 }
      };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/example.akadns.net/connections/100',
    query: {},
    body: { timestamp: '2020-01-01T00:00:00Z', load: 42 },
    method: 'POST'
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { title: 'Bad Request', status: 400 });
});

test('rejects unsupported GTM Load Data methods and paths explicitly', () => {
  assert.throws(
    () => apiRegistry.put({}, PATH, {}, {}),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.post({}, `${PREFIX}/unknown`, {}, {}),
    /No API module supports POST path/
  );
});

test('does not attempt dynamic completion for GTM Load Data path values', async () => {
  let requests = 0;
  const [candidates] = await gtmLoadData.complete(
    `${PREFIX}/example.akadns.net/connections/1`,
    {},
    new Map(),
    async () => {
      requests += 1;
      throw new Error('dynamic lookup should not be attempted');
    }
  );

  assert.deepEqual(candidates, []);
  assert.equal(requests, 0);
});
