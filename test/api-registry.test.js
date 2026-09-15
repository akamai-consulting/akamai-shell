'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('routes slash-prefixed paths to the PropertyManager module', async () => {
  const apiModule = apiRegistry.moduleFor('/papi/v1/properties');
  assert.equal(apiModule.name, 'PropertyManager');
  assert.equal(apiRegistry.moduleFor('/papi/v1/properties').name, 'PropertyManager');

  const response = await apiRegistry.get({}, '/papi/v1/properties', { contractId: 'ctr_1' },
    async (settings, path, query) => ({ settings, path, query }));
  assert.deepEqual(response, {
    settings: {},
    path: '/properties',
    query: { contractId: 'ctr_1' }
  });
});

test('routes Cloudlets paths to the Cloudlets module', async () => {
  assert.equal(apiRegistry.moduleFor('/cloudlets/v3/cloudlet-info').name, 'Cloudlets');
  assert.equal(apiRegistry.moduleFor('/cloudlets/v3/policies').name, 'Cloudlets');
  assert.equal(apiRegistry.moduleFor('/cloudlets/v3/policies').name, 'Cloudlets');
  assert.equal(apiRegistry.moduleFor('/papi/v1/properties').name, 'PropertyManager');
  assert.deepEqual(apiRegistry.modulesFor('/papi/v1/properties').map(({ name }) => name), [
    'PropertyManager'
  ]);

  let request;
  await apiRegistry.get({}, '/cloudlets/v3/policies', { cloudletId: '3' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { body: [] };
    });

    test('discovers and routes the Cloudlets v2 module by API prefix', () => {
      assert.equal(apiRegistry.moduleFor('/cloudlets/api/v2/policies').name, 'CloudletsV2');
      assert(apiRegistry.API_MODULES.some(({ prefix }) => prefix === '/cloudlets/api/v2'));
    });

    test('discovers and routes Edge Diagnostics by API prefix', () => {
      assert.equal(apiRegistry.moduleFor('/edge-diagnostics/v1/edge-locations').name,
        'EdgeDiagnostics');
      assert(apiRegistry.queryParameters().includes('includeContentResponseBody'));
    });

    test('discovers and routes Edge DNS by API prefix', () => {
      assert.equal(apiRegistry.moduleFor('/config-dns/v2/zones').name, 'EdgeDns');
      assert(apiRegistry.queryParameters().includes('dnsSecStatus'));
    });
  assert.deepEqual(request, { settings: {}, path: '/policies', query: { cloudletId: '3' } });
});

test('rejects paths when no API module supports them', () => {
  const originalModules = apiRegistry.API_MODULES.splice(0);
  try {
    assert.throws(() => apiRegistry.moduleFor('/unknown'), /No API module supports path/);
  } finally {
    apiRegistry.API_MODULES.push(...originalModules);
  }
});

test('routes Edge Diagnostics POST paths without treating them as GET', async () => {
  let request;
  const response = await apiRegistry.post({}, '/edge-diagnostics/v1/curl',
    { accountSwitchKey: 'a' }, { url: 'https://example.test' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { accepted: true } };
    });

  assert.deepEqual(request, {
    settings: {},
    path: '/curl',
    query: { accountSwitchKey: 'a' },
    body: { url: 'https://example.test' },
    method: 'POST'
  });
  assert.deepEqual(response.body, { accepted: true });
  assert.throws(
    () => apiRegistry.post({}, '/edge-diagnostics/v1/curl', {}),
    /POST requires a JSON body/
  );
  assert.throws(
    () => apiRegistry.put({}, '/edge-diagnostics/v1/curl', {}, { url: 'x' }),
    /No API module supports PUT path/
  );
});

test('completes Edge Diagnostics POST-only paths', async () => {
  const [candidates, partial] = await apiRegistry.completeMethod(
    'POST', '/edge-diagnostics/v1/', {}, new Map()
  );
  assert.equal(partial, '/edge-diagnostics/v1/');
  assert(candidates.includes('/edge-diagnostics/v1/curl'));
  assert(candidates.includes('/edge-diagnostics/v1/esi-debugger-api'));
  assert(!candidates.includes('/edge-diagnostics/v1/edge-locations'));
});

test('completes POST paths from the command root', async () => {
  const [candidates, partial] = await apiRegistry.completeMethod('POST', '/', {}, new Map());
  assert.equal(partial, '/');
  assert(candidates.includes('/edge-diagnostics/v1/curl'));
  assert(candidates.includes('/edge-diagnostics/v1/locate-ip'));
  assert(!candidates.includes('/edge-diagnostics/v1/edge-locations'));
});
