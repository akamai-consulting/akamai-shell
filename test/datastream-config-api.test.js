'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const datastream = require('../src/apis/datastream-config-api');

test('discovers DataStream Config API v2 with its documented service prefix', () => {
  assert.equal(datastream.prefix, '/datastream-config-api/v2');
  assert.equal(apiRegistry.moduleFor('/datastream-config-api/v2/log/streams').name,
    'DataStreamConfig');
  assert(apiRegistry.modulesForMethod('GET', '/datastream-config-api/v2/log/groups')
    .includes(datastream));
  assert(apiRegistry.modulesForMethod('POST', '/datastream-config-api/v2/log/streams')
    .includes(datastream));
  assert(apiRegistry.modulesForMethod('PUT', '/datastream-config-api/v2/log/streams/123')
    .includes(datastream));
  assert.throws(
    () => apiRegistry.moduleForMethod('PATCH', '/datastream-config-api/v2/log/streams/123'),
    /No API module supports PATCH path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('POST', '/datastream-config-api/v2/log/streams/123/activate'),
    /No API module supports POST path/
  );
});

test('routes DataStream requests with the relative API path and method', async () => {
  let request;
  await apiRegistry.put({}, '/datastream-config-api/v2/log/streams/123',
    { activate: 'false' }, { streamName: 'updated' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, body: { streamId: 123 } };
    });
  assert.deepEqual(request, {
    settings: {},
    path: '/log/streams/123',
    query: { activate: 'false' },
    body: { streamName: 'updated' },
    method: 'PUT'
  });
});

test('completes DataStream group and stream identifiers using cached collections', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    if (path === '/log/groups') {
      return { statusCode: 200, body: { groups: [{ groupId: 12345 }, { groupId: 67890 }] } };
    }
    if (path === '/log/streams') {
      return { statusCode: 200, body: { streams: [{ streamId: 7050 }, { streamId: 8123 }] } };
    }
    throw new Error(`unexpected completion path ${path}`);
  };

  const [groups] = await datastream.complete(
    '/datastream-config-api/v2/log/groups/12', {}, cache, requestGet
  );
  const [streams] = await datastream.complete(
    '/datastream-config-api/v2/log/streams/70', {}, cache, requestGet
  );
  const [cachedGroups] = await datastream.complete(
    '/datastream-config-api/v2/log/groups/12', {}, cache, requestGet
  );

  assert.deepEqual(groups, ['/datastream-config-api/v2/log/groups/12345']);
  assert.deepEqual(streams, ['/datastream-config-api/v2/log/streams/7050']);
  assert.deepEqual(cachedGroups, groups);
  assert.equal(requests, 2);
});
