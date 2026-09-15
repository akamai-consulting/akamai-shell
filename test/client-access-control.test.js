'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes Client Access Control paths using its documented service prefix', async () => {
  const apiModule = apiRegistry.moduleFor('/client-access-control/v1/configurations');
  assert.equal(apiModule.name, 'ClientAccessControl');
  assert.equal(apiModule.prefix, '/client-access-control/v1');
  assert.deepEqual(apiModule.queryParameters, ['accountSwitchKey']);

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/client-access-control/v1/configurations',
    { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [] };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/configurations',
    query: { accountSwitchKey: 'account' }
  });
  assert.equal(response.statusCode, 200);
});

test('supports documented GET and PUT methods only', async () => {
  let request;
  const response = await apiRegistry.put(
    {},
    '/client-access-control/v1/configurations/1060/acknowledge/2',
    {},
    {},
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 204, body: null };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/configurations/1060/acknowledge/2',
    query: {},
    body: {},
    method: 'PUT'
  });
  assert.equal(response.statusCode, 204);
  assert.throws(
    () => apiRegistry.post({}, '/client-access-control/v1/configurations', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/client-access-control/v1/configurations/1060', {}, {}),
    /No API module supports PUT path/
  );
});

test('completes configuration IDs and proposed versions through cached lookups', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    if (path === '/configurations') {
      assert.deepEqual({ settings, query }, { settings: {}, query: {} });
      return {
        statusCode: 200,
        body: [
          { configurationId: 1060 },
          { configurationId: 1062 }
        ]
      };
    }
    assert.equal(path, '/configurations/1060');
    return {
      statusCode: 200,
      body: { proposedCidrs: [{ version: 2 }, { version: 3 }] }
    };
  };

  const first = await apiRegistry.complete(
    '/client-access-control/v1/configurations/106',
    {},
    cache,
    requestGet
  );
  const second = await apiRegistry.complete(
    '/client-access-control/v1/configurations/1060/acknowledge/',
    {},
    cache,
    requestGet
  );
  const third = await apiRegistry.complete(
    '/client-access-control/v1/configurations/1060/acknowledge/3',
    {},
    cache,
    requestGet
  );

  assert.deepEqual(first[0], [
    '/client-access-control/v1/configurations/1060',
    '/client-access-control/v1/configurations/1062'
  ]);
  assert.deepEqual(second[0], [
    '/client-access-control/v1/configurations/1060/acknowledge/2',
    '/client-access-control/v1/configurations/1060/acknowledge/3'
  ]);
  assert.deepEqual(third[0], [
    '/client-access-control/v1/configurations/1060/acknowledge/3'
  ]);
  assert.equal(calls, 2);
});
