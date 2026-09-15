'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

const PREFIX = '/firewall-rules-manager/v1';

test('routes Firewall Rules Manager operations using its documented prefix', async () => {
  const apiModule = apiRegistry.moduleFor(`${PREFIX}/cidr-blocks`);
  assert.equal(apiModule.name, 'FirewallRulesManager');
  assert.equal(apiModule.prefix, PREFIX);
  assert.deepEqual(apiModule.queryParameters, [
    'lastAction',
    'effectiveDateGt',
    'accountSwitchKey'
  ]);

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    `${PREFIX}/cidr-blocks`,
    { lastAction: 'add' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [{ cidrId: 1 }] };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/cidr-blocks',
    query: { lastAction: 'add' }
  });
  assert.equal(response.statusCode, 200);
});

test('dispatches documented PUT and rejects unsupported PATCH', async () => {
  let request;
  const response = await apiRegistry.put(
    {},
    `${PREFIX}/subscriptions`,
    { accountSwitchKey: 'account' },
    { subscriptions: [{ serviceId: 3, email: 'user@example.test' }] },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { subscriptions: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/subscriptions',
    query: { accountSwitchKey: 'account' },
    body: { subscriptions: [{ serviceId: 3, email: 'user@example.test' }] },
    method: 'PUT'
  });
  assert.equal(response.statusCode, 202);
  assert.throws(
    () => apiRegistry.dispatch(
      'PATCH', {}, `${PREFIX}/subscriptions`, {}, { subscriptions: [] }
    ),
    /No API module supports PATCH path/
  );
});

test('completes service identifiers from the services collection and caches it', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/services', query: {} });
    return {
      statusCode: 200,
      body: [
        { serviceId: 3, serviceName: 'TestIP' },
        { serviceId: 42, serviceName: 'Other' }
      ]
    };
  };

  const first = await apiRegistry.complete(
    `${PREFIX}/services/9`, {}, cache, requestGet
  );
  const second = await apiRegistry.complete(
    `${PREFIX}/services/3`, {}, cache, requestGet
  );

  assert.deepEqual(first[0], []);
  assert.deepEqual(second[0], [`${PREFIX}/services/3`]);
  assert.equal(calls, 1);
});
