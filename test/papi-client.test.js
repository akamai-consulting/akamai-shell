'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { get, validateRequiredParameters } = require('../src/papi-client');

function fakeClientFactory(requests, body) {
  return () => ({
    auth(request) {
      requests.push(request);
      return this;
    },
    send(callback) {
      callback(null, { status: 200, headers: { 'content-type': 'application/json' } }, JSON.stringify(body));
    }
  });
}

test('gets contracts through the PAPI endpoint', async () => {
  const requests = [];
  const response = await get(
    { edgerc: '/tmp/test-edgerc', edgercSection: 'papi' },
    '/contracts',
    {},
    fakeClientFactory(requests, { contracts: { items: [] } })
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { contracts: { items: [] } });
  assert.equal(requests[0].path, '/papi/v1/contracts');
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].headers.Accept, 'application/json');
  assert.equal(requests[0].headers['PAPI-Use-Prefixes'], 'true');
});

test('adds global contract and group IDs to contextual resources', async () => {
  const requests = [];
  await get(
    {
      edgerc: '/tmp/test-edgerc',
      edgercSection: 'papi',
      contractId: 'ctr_global',
      groupId: 'grp_global'
    },
    '/cpcodes',
    {},
    fakeClientFactory(requests, { cpcodes: { items: [] } })
  );

  assert.deepEqual(requests[0].qs, {
    contractId: 'ctr_global',
    groupId: 'grp_global'
  });
});

test('adds the global contract ID to products', async () => {
  const requests = [];
  await get(
    {
      edgerc: '/tmp/test-edgerc',
      edgercSection: 'papi',
      contractId: 'ctr_global'
    },
    '/products',
    {},
    fakeClientFactory(requests, { products: { items: [] } })
  );

  assert.deepEqual(requests[0].qs, { contractId: 'ctr_global' });
});

test('reports missing required query parameters before sending', () => {
  assert.throws(
    () => validateRequiredParameters('/cpcodes', { contractId: 'ctr_123' }),
    /Missing required query parameter: groupId/
  );
  assert.throws(
    () => validateRequiredParameters('/products', {}),
    /Missing required query parameter: contractId/
  );
});

test('does not add contextual IDs to resources that do not support them', async () => {
  const requests = [];
  await get(
    {
      edgerc: '/tmp/test-edgerc',
      edgercSection: 'papi',
      contractId: 'ctr_global',
      groupId: 'grp_global'
    },
    '/contracts',
    {},
    fakeClientFactory(requests, { contracts: { items: [] } })
  );

  assert.deepEqual(requests[0].qs, {});
});

test('gets a property with query parameters', async () => {
  const requests = [];
  await get(
    { edgerc: '/tmp/test-edgerc', edgercSection: 'papi' },
    '/properties/prp_123',
    { contractId: 'ctr_123', groupId: 'grp_123' },
    fakeClientFactory(requests, { propertyId: 'prp_123' })
  );

  assert.equal(requests[0].path, '/papi/v1/properties/prp_123');
  assert.deepEqual(requests[0].qs, { contractId: 'ctr_123', groupId: 'grp_123' });
});

test('adds the configured account switch key unless overridden', async () => {
  const requests = [];
  const factory = fakeClientFactory(requests, { properties: { items: [] } });
  const settings = {
    edgerc: '/tmp/test-edgerc',
    edgercSection: 'papi',
    accountSwitchKey: '1-ABC:1-DEF',
    contractId: 'ctr_test',
    groupId: 'grp_test'
  };

  await get(settings, '/properties', {}, factory);
  await get(settings, '/properties', { accountSwitchKey: '1-OVERRIDE' }, factory);

  assert.equal(requests[0].qs.accountSwitchKey, '1-ABC:1-DEF');
  assert.equal(requests[1].qs.accountSwitchKey, '1-OVERRIDE');
});

test('gets property rule trees as a read-only resource', async () => {
  const requests = [];
  await get(
    { edgerc: '/tmp/test-edgerc', edgercSection: 'papi' },
    '/properties/prp_123/versions/3/rules',
    {},
    fakeClientFactory(requests, { rules: { name: 'default' } })
  );

  assert.equal(requests[0].path, '/papi/v1/properties/prp_123/versions/3/rules');
});
