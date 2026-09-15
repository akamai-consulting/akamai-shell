'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const configMediaLive = require('../src/apis/config-media-live');

test('discovers Config Media Live by its documented service prefix', () => {
  assert.equal(apiRegistry.moduleFor('/config-media-live/v2/msl-origin/streams').name,
    'ConfigMediaLive');
  assert.equal(configMediaLive.prefix, '/config-media-live/v2');
  assert.deepEqual(configMediaLive.methodPaths.POST, [
    '/msl-origin/cpcodes',
    '/msl-origin/origins',
    '/msl-origin/streams'
  ]);
  assert.deepEqual(configMediaLive.methodPaths.DELETE, [
    '/msl-origin/origins/{originId}',
    '/msl-origin/streams/{streamId}'
  ]);
  assert(configMediaLive.queryParameters.includes('purgeContent'));
});

test('routes documented methods and preserves response status and body', async () => {
  let request;
  const response = await apiRegistry.put(
    {},
    '/config-media-live/v2/msl-origin/streams/745645',
    { accountSwitchKey: 'account' },
    { name: 'Updated stream' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, headers: { etag: 'abc' }, body: { id: 745645 } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/msl-origin/streams/745645',
    query: { accountSwitchKey: 'account' },
    body: { name: 'Updated stream' },
    method: 'PUT'
  });
  assert.deepEqual(response, {
    statusCode: 200,
    headers: { etag: 'abc' },
    body: { id: 745645 }
  });

  const error = await apiRegistry.get(
    {},
    '/config-media-live/v2/msl-origin/origins/101',
    {},
    async () => ({ statusCode: 400, body: { title: 'Bad request' } })
  );
  assert.equal(error.statusCode, 400);
  assert.deepEqual(error.body, { title: 'Bad request' });
});

test('rejects methods and paths not documented by Config Media Live', () => {
  assert.throws(
    () => apiRegistry.post({}, '/config-media-live/v2/msl-origin/origins/101', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.get({}, '/config-media-live/v2/msl-origin/unknown', {}),
    /No API module supports GET path/
  );
});

test('completes origin and stream identifiers with cached collection requests', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual(query, {});
    if (path === '/msl-origin/origins') {
      return { statusCode: 200, body: [{ id: 101 }, { id: 202 }] };
    }
    if (path === '/msl-origin/streams') {
      return { statusCode: 200, body: { streams: [{ id: 745645 }, { id: 812300 }] } };
    }
    throw new Error(`unexpected path ${path}`);
  };

  let [candidates] = await apiRegistry.complete(
    '/config-media-live/v2/msl-origin/origins/1', {}, cache, requestGet
  );
  assert.deepEqual(candidates, ['/config-media-live/v2/msl-origin/origins/101']);
  [candidates] = await apiRegistry.complete(
    '/config-media-live/v2/msl-origin/origins/1', {}, cache, requestGet
  );
  assert.deepEqual(candidates, ['/config-media-live/v2/msl-origin/origins/101']);

  [candidates] = await apiRegistry.complete(
    '/config-media-live/v2/msl-origin/streams/8', {}, cache, requestGet
  );
  assert.deepEqual(candidates, ['/config-media-live/v2/msl-origin/streams/812300']);
  assert.equal(calls, 2);
});

test('turns failed dynamic completion into a silent no-match', async () => {
  const [candidates] = await apiRegistry.complete(
    '/config-media-live/v2/msl-origin/streams/7',
    {},
    new Map(),
    async () => ({ statusCode: 403, body: { title: 'Forbidden' } })
  );
  assert.deepEqual(candidates, []);
});
