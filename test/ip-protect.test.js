'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const ipProtect = require('../src/apis/ip-protect');

const PREFIX = '/ip-protect/v1';

test('loads IP Protect operations and its documented service prefix', () => {
  assert.equal(ipProtect.name, 'IpProtect');
  assert.equal(ipProtect.prefix, PREFIX);
  assert.deepEqual(ipProtect.methodPaths.GET, [
    '/mips',
    '/policy-domains',
    '/policy-domains/{pdName}',
    '/policy-domains/{pdName}/configs',
    '/policy-domains/{pdName}/vips/health-stats'
  ]);
  assert.deepEqual(ipProtect.methodPaths.POST, [
    '/policy-domains/vips',
    '/policy-domains/vips/health-stats',
    '/policy-domains/{pdName}/configs'
  ]);
  assert.deepEqual(ipProtect.methodPaths.PUT, [
    '/policy-domains/{pdName}/pd-subnets/allocate'
  ]);
  assert(ipProtect.queryParameters.includes('latest'));
  assert(ipProtect.queryParameters.includes('accountSwitchKey'));
  assert(ipProtect.queryParameters.includes('startTime'));
});

test('routes documented IP Protect methods with generic request construction', async () => {
  const requests = [];
  const request = async (settings, path, query, body, method) => {
    requests.push({ settings, path, query, body, method });
    return {
      statusCode: method === 'GET' ? 200 : 202,
      headers: { 'x-request-id': 'request-1' },
      body: { accepted: true }
    };
  };

  await apiRegistry.get({}, `${PREFIX}/policy-domains`, { latest: true }, request);
  await apiRegistry.post(
    {},
    `${PREFIX}/policy-domains/vips`,
    { accountSwitchKey: 'account-1' },
    { vipIds: [1, 2] },
    request
  );
  const response = await apiRegistry.put(
    {},
    `${PREFIX}/policy-domains/example/pd-subnets/allocate`,
    {},
    { addVips: 2, allocateIpv6: false },
    request
  );

  assert.deepEqual(requests, [
    { settings: {}, path: '/policy-domains', query: { latest: true },
      body: undefined, method: undefined },
    { settings: {}, path: '/policy-domains/vips', query: { accountSwitchKey: 'account-1' },
      body: { vipIds: [1, 2] }, method: 'POST' },
    { settings: {}, path: '/policy-domains/example/pd-subnets/allocate', query: {},
      body: { addVips: 2, allocateIpv6: false }, method: 'PUT' }
  ]);
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { accepted: true });
});

test('rejects unsupported IP Protect method and path combinations', () => {
  assert.throws(
    () => apiRegistry.moduleForMethod('GET', `${PREFIX}/policy-domains/vips/health-stats`),
    /No API module supports GET path/
  );
  assert.throws(
    () => apiRegistry.moduleForMethod('POST', `${PREFIX}/mips`),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, `${PREFIX}/policy-domains/example/pd-subnets/allocate`, {}),
    /PUT requires a JSON body/
  );
});

test('completes policy domain names through a cached collection lookup', async () => {
  const cache = new Map();
  const calls = [];
  const requestGet = async (settings, path, query) => {
    calls.push({ settings, path, query });
    return {
      statusCode: 200,
      body: ['documentation_na', 'production-eu', 'production-us']
    };
  };

  const first = await apiRegistry.complete(
    `${PREFIX}/policy-domains/prod`, {}, cache, requestGet
  );
  const second = await apiRegistry.complete(
    `${PREFIX}/policy-domains/production-`, {}, cache, requestGet
  );

  assert.deepEqual(first[0], [
    `${PREFIX}/policy-domains/production-eu`,
    `${PREFIX}/policy-domains/production-us`
  ]);
  assert.deepEqual(second[0], [
    `${PREFIX}/policy-domains/production-eu`,
    `${PREFIX}/policy-domains/production-us`
  ]);
  assert.deepEqual(calls, [{ settings: {}, path: '/policy-domains', query: {} }]);
});
