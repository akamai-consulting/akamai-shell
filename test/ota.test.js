'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const ota = require('../src/apis/ota');

const PREFIX = '/ota/v1';

test('loads OTA operations and confirms the documented service prefix', () => {
  assert.equal(ota.name, 'OtaUpdates');
  assert.equal(ota.prefix, PREFIX);
  assert.deepEqual(ota.queryParameters.sort(), ['accountSwitchKey', 'start']);
  assert.deepEqual(ota.methodPaths.GET, [
    '/cpcodes',
    '/download-notifications/{cpcode}'
  ]);
  assert.equal(apiRegistry.moduleFor('/ota/v1/cpcodes'), ota);
});

test('routes OTA GET requests with the relative path and response intact', async () => {
  let request;
  const response = await apiRegistry.get(
    { edgerc: 'credentials', edgercSection: 'default' },
    '/ota/v1/download-notifications/12345',
    { start: 1497947550000, accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return {
        statusCode: 200,
        headers: { 'x-request-id': 'request' },
        body: { notifications: [] }
      };
    }
  );

  assert.deepEqual(request, {
    settings: { edgerc: 'credentials', edgercSection: 'default' },
    path: '/download-notifications/12345',
    query: { start: 1497947550000, accountSwitchKey: 'account' }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-request-id'], 'request');
  assert.deepEqual(response.body, { notifications: [] });
});

test('rejects unsupported OTA methods and paths explicitly', () => {
  assert.throws(
    () => apiRegistry.post({}, '/ota/v1/cpcodes', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.get({}, '/ota/v1/unknown', {}),
    /No API module supports GET path/
  );
});

test('completes OTA CP code identifiers using the cached collection lookup', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path, query) => {
    requests += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/cpcodes', query: {} });
    return {
      statusCode: 200,
      body: [{ id: 100001 }, { id: 100002 }, { id: 200001 }]
    };
  };

  const first = await ota.complete(
    '/ota/v1/download-notifications/100', {}, cache, requestGet
  );
  const second = await ota.complete(
    '/ota/v1/download-notifications/100', {}, cache, requestGet
  );

  assert.deepEqual(first[0], [
    '/ota/v1/download-notifications/100001',
    '/ota/v1/download-notifications/100002'
  ]);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});

test('returns no candidates when OTA completion lookup fails', async () => {
  const [candidates, partial] = await ota.complete(
    '/ota/v1/download-notifications/1', {}, new Map(), async () => {
      throw new Error('request failed');
    }
  );
  assert.deepEqual(candidates, []);
  assert.equal(partial, '/ota/v1/download-notifications/1');
});
