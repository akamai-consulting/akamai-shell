'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const prolexicNetworkHealth = require('../src/apis/prolexic-network-health');

test('discovers Prolexic Network Health with its documented prefix', () => {
  const apiModule = apiRegistry.moduleFor('/prolexic-network-health/v1/targets');
  assert.equal(apiModule, prolexicNetworkHealth);
  assert.equal(apiModule.name, 'ProlexicNetworkHealth');
  assert.equal(apiModule.prefix, '/prolexic-network-health/v1');
  assert.deepEqual(apiModule.queryParameters, ['accountSwitchKey']);
});

test('routes documented GET, POST, and PUT requests with response status and body', async () => {
  const requests = [];
  const request = async (settings, path, query, body, method) => {
    requests.push({ settings, path, query, body, method });
    return {
      statusCode: method === undefined ? 200 : 201,
      body: method === undefined
        ? { targets: [{ targetId: '20' }] }
        : { targetId: '21' }
    };
  };

  const getResponse = await apiRegistry.get(
    { edgercSection: 'test' },
    '/prolexic-network-health/v1/targets/20',
    { accountSwitchKey: 'account' },
    request
  );
  const postResponse = await apiRegistry.post(
    {},
    '/prolexic-network-health/v1/targets',
    {},
    { targetName: 'web' },
    request
  );
  const putResponse = await apiRegistry.put(
    {},
    '/prolexic-network-health/v1/targets/21',
    {},
    { targetName: 'updated' },
    request
  );

  assert.deepEqual(requests, [
    {
      settings: { edgercSection: 'test' },
      path: '/targets/20',
      query: { accountSwitchKey: 'account' },
      body: undefined,
      method: undefined
    },
    {
      settings: {},
      path: '/targets',
      query: {},
      body: { targetName: 'web' },
      method: 'POST'
    },
    {
      settings: {},
      path: '/targets/21',
      query: {},
      body: { targetName: 'updated' },
      method: 'PUT'
    }
  ]);
  assert.equal(getResponse.statusCode, 200);
  assert.deepEqual(postResponse.body, { targetId: '21' });
  assert.equal(putResponse.statusCode, 201);
});

test('rejects unsupported Prolexic methods and paths explicitly', () => {
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/prolexic-network-health/v1/targets/20'),
    /No API module supports DELETE path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/prolexic-network-health/v1/targets/20', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/prolexic-network-health/v1/targets', {}, {}),
    /No API module supports PUT path/
  );
});

test('completes target identifiers from the collection response and caches it', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path, query) => {
    requests += 1;
    assert.deepEqual({ settings, path, query }, {
      settings: {},
      path: '/targets',
      query: {}
    });
    return {
      statusCode: 200,
      body: {
        targets: [
          { targetId: '20' },
          { targetId: '21' }
        ]
      }
    };
  };

  const first = await prolexicNetworkHealth.complete(
    '/prolexic-network-health/v1/targets/2',
    {},
    cache,
    requestGet
  );
  const second = await prolexicNetworkHealth.complete(
    '/prolexic-network-health/v1/targets/20',
    {},
    cache,
    requestGet
  );

  assert.deepEqual(first[0], [
    '/prolexic-network-health/v1/targets/20',
    '/prolexic-network-health/v1/targets/21'
  ]);
  assert.deepEqual(second[0], ['/prolexic-network-health/v1/targets/20']);
  assert.equal(requests, 1);
});
