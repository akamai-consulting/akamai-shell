'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const eccu = require('../src/apis/eccu-api');

const PREFIX = '/eccu-api/v1';

test('loads ECCU operations from the checked-in OpenAPI catalog', () => {
  assert.equal(eccu.name, 'ECCU');
  assert.equal(eccu.prefix, PREFIX);
  assert.deepEqual(eccu.queryParameters, ['accountSwitchKey']);
  assert.deepEqual(eccu.methodPaths.GET, [
    '/permissions',
    '/properties',
    '/requests',
    '/requests/{requestId}'
  ]);
  assert.deepEqual(eccu.methodPaths.POST, ['/requests']);
  assert.equal(eccu.methodPaths.DELETE, undefined);
});

test('routes ECCU GET and POST requests with status and response intact', async () => {
  const requests = [];
  const request = async (settings, path, query, body, method) => {
    requests.push({ settings, path, query, body, method });
    return {
      statusCode: method === 'POST' ? 202 : 200,
      headers: { location: '/eccu-api/v1/requests/263529539' },
      body: { requestId: 263529539 }
    };
  };
  const settings = { edgerc: 'credentials', edgercSection: 'default' };

  const getResponse = await apiRegistry.get(
    settings, `${PREFIX}/requests/263529539`, { accountSwitchKey: 'account' }, request
  );
  const postResponse = await apiRegistry.post(
    settings, `${PREFIX}/requests`, { accountSwitchKey: 'account' },
    { propertyName: 'www.example.com', metadata: '<eccu />' }, request
  );

  assert.equal(getResponse.statusCode, 200);
  assert.equal(postResponse.statusCode, 202);
  assert.deepEqual(requests, [
    {
      settings,
      path: '/requests/263529539',
      query: { accountSwitchKey: 'account' },
      body: undefined,
      method: undefined
    },
    {
      settings,
      path: '/requests',
      query: { accountSwitchKey: 'account' },
      body: { propertyName: 'www.example.com', metadata: '<eccu />' },
      method: 'POST'
    }
  ]);
});

test('completes ECCU request IDs from the requests collection', async () => {
  const calls = [];
  const cache = new Map();
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    return {
      statusCode: 200,
      body: { requests: [{ requestId: 263529539 }, { requestId: 987654321 }] }
    };
  };

  const result = await apiRegistry.complete(
    `${PREFIX}/requests/263`, {}, cache, requestGet
  );

  assert.deepEqual(result[0], [`${PREFIX}/requests/263529539`]);
  assert.deepEqual(calls, [{ settings: {}, path: '/requests', query: {} }]);
});

test('rejects unsupported ECCU methods and paths', () => {
  assert.throws(
    () => apiRegistry.get({}, `${PREFIX}/unknown`, {}),
    /No API module supports GET path/
  );
  assert.throws(
    () => apiRegistry.post({}, `${PREFIX}/requests/263529539`, {}, {}),
    /No API module supports POST path/
  );
});
