'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('routes Network Cloud Firewall paths using its documented service prefix', async () => {
  const module = apiRegistry.moduleFor('/network-cloud-firewall/v1/acls/aliases');
  assert.equal(module.name, 'NetworkCloudFirewall');
  assert.equal(module.prefix, '/network-cloud-firewall/v1');

  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    '/network-cloud-firewall/v1/acls/aliases',
    { accountSwitchKey: 'account' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: [] };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/acls/aliases',
    query: { accountSwitchKey: 'account' }
  });
  assert.equal(response.statusCode, 200);
});

test('preserves API error status and body from the generic request path', async () => {
  const response = await apiRegistry.get(
    {},
    '/network-cloud-firewall/v1/stats',
    {},
    async () => ({ statusCode: 403, headers: { 'x-request-id': 'request' }, body: {
      title: 'Forbidden',
      detail: 'Access denied'
    } })
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    title: 'Forbidden',
    detail: 'Access denied'
  });
});

test('dispatches documented POST and PUT methods and rejects unsupported methods', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 201, body: { accepted: true } };
  };

  await apiRegistry.post(
    {}, '/network-cloud-firewall/v1/acls/aliases', {}, { aliasName: 'trusted' }, handler
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/acls/aliases',
    query: {},
    body: { aliasName: 'trusted' },
    method: 'POST'
  });

  await apiRegistry.put(
    {}, '/network-cloud-firewall/v1/acls/aliases/7', {}, { aliasName: 'updated' }, handler
  );
  assert.equal(request.path, '/acls/aliases/7');
  assert.equal(request.method, 'PUT');
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/network-cloud-firewall/v1/acls/aliases/7'),
    /No API module supports DELETE path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('PATCH', '/network-cloud-firewall/v1/acls/versions/1'),
    /No API module supports PATCH path/
  );
});

test('completes aliases, versions, and rule IDs using cached collection requests', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    if (path === '/acls/aliases') {
      return { statusCode: 200, body: [{ aliasId: 12 }, { aliasId: 24 }] };
    }
    if (path === '/acls/versions') {
      return { statusCode: 200, body: { content: [{ version: 1 }, { version: 12 }] } };
    }
    return {
      statusCode: 200,
      body: { rules: [{ ruleId: 'abc-123' }, { ruleId: 'def-456' }] }
    };
  };

  let result = await apiRegistry.complete(
    '/network-cloud-firewall/v1/acls/aliases/1', {}, cache, requestGet
  );
  assert.deepEqual(result[0], ['/network-cloud-firewall/v1/acls/aliases/12']);
  result = await apiRegistry.complete(
    '/network-cloud-firewall/v1/acls/aliases/2', {}, cache, requestGet
  );
  assert.deepEqual(result[0], ['/network-cloud-firewall/v1/acls/aliases/24']);
  result = await apiRegistry.complete(
    '/network-cloud-firewall/v1/acls/versions/1', {}, cache, requestGet
  );
  assert.deepEqual(result[0], [
    '/network-cloud-firewall/v1/acls/versions/1',
    '/network-cloud-firewall/v1/acls/versions/12'
  ]);
  result = await apiRegistry.complete(
    '/network-cloud-firewall/v1/rule-hits/rules/a', {}, cache, requestGet
  );
  assert.deepEqual(result[0], ['/network-cloud-firewall/v1/rule-hits/rules/abc-123']);
  assert.equal(calls.length, 3);
});
