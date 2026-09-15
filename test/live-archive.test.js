'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const liveArchive = require('../src/apis/live-archive');

test('discovers Live Archive at its documented service prefix', () => {
  assert.equal(apiRegistry.moduleFor('/live-archive/v1/streams/123/archives').name,
    'LiveArchive');
  assert.equal(liveArchive.prefix, '/live-archive/v1');
  assert.deepEqual(liveArchive.queryParameters.sort(), [
    'accountSwitchKey', 'endTime', 'startTime'
  ]);
});

test('supports only the documented shell methods and routes POST bodies', async () => {
  assert(apiRegistry.modulesForMethod('GET', '/live-archive/v1/vod/abc').includes(liveArchive));
  assert(apiRegistry.modulesForMethod('POST', '/live-archive/v1/vod').includes(liveArchive));
  assert(!apiRegistry.modulesForMethod('PUT', '/live-archive/v1/vod').includes(liveArchive));
  assert(!apiRegistry.modulesForMethod('DELETE',
    '/live-archive/v1/streams/123/endpoints/example').includes(liveArchive));

  let request;
  const response = await apiRegistry.post(
    { accountSwitchKey: 'account' },
    '/live-archive/v1/vod',
    {},
    { URI: '/hls/123/event/master.m3u8', startTime: 10, endTime: 40 },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { EID: 'export-1' } };
    }
  );

  assert.deepEqual(request, {
    settings: { accountSwitchKey: 'account' },
    path: '/vod',
    query: {},
    body: { URI: '/hls/123/event/master.m3u8', startTime: 10, endTime: 40 },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { EID: 'export-1' });
});

test('routes GET paths and preserves API error status and body', async () => {
  let request;
  const response = await apiRegistry.get(
    {},
    '/live-archive/v1/streams/123/archives',
    { startTime: 10, endTime: 20 },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 403, headers: { 'x-request-id': 'request-1' },
        body: { error: 'API disabled' } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/streams/123/archives',
    query: { startTime: 10, endTime: 20 }
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'API disabled' });
  assert.equal(response.headers['x-request-id'], 'request-1');
});

test('completes stream endpoint values from the documented collection response', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    assert.equal(path, '/streams/123/endpoints');
    return {
      statusCode: 200,
      body: { endpoints: ['event/master.m3u8', 'event/preview.m3u8', 'other'] }
    };
  };

  const first = await liveArchive.complete(
    '/live-archive/v1/streams/123/endpoints/event/',
    {}, cache, requestGet
  );
  const second = await liveArchive.complete(
    '/live-archive/v1/streams/123/endpoints/event/p',
    {}, cache, requestGet
  );

  assert.deepEqual(first[0], [
    '/live-archive/v1/streams/123/endpoints/event/master.m3u8',
    '/live-archive/v1/streams/123/endpoints/event/preview.m3u8'
  ]);
  assert.deepEqual(second[0], [
    '/live-archive/v1/streams/123/endpoints/event/preview.m3u8'
  ]);
  assert.equal(requests, 1);
});
