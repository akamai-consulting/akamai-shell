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

test('routes Property Manager rule-tree PUT requests', async () => {
  const rules = { behaviors: [], children: [] };
  const response = await apiRegistry.put(
    {},
    '/papi/v1/properties/prp_366150/versions/10/rules',
    {},
    rules,
    async (settings, path, query, body, method) => ({ settings, path, query, body, method })
  );
  assert.deepEqual(response, {
    settings: {},
    path: '/properties/prp_366150/versions/10/rules',
    query: {},
    body: rules,
    method: 'PUT'
  });
});

test('routes Property Manager version creation POST requests', async () => {
  const response = await apiRegistry.post(
    {},
    '/papi/v1/properties/prp_366150/versions',
    {},
    { createFromVersion: 10 },
    async (settings, path, query, body, method) => ({ settings, path, query, body, method })
  );
  assert.deepEqual(response, {
    settings: {},
    path: '/properties/prp_366150/versions',
    query: {},
    body: { createFromVersion: 10 },
    method: 'POST'
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

test('routes Cloudlets v3 policy version PUT requests', async () => {
  const body = { matchRules: [{ name: 'example' }] };
  const response = await apiRegistry.put(
    {},
    '/cloudlets/v3/policies/371861/versions/1',
    {},
    body,
    async (settings, path, query, requestBody, method) => ({
      settings, path, query, body: requestBody, method
    })
  );
  assert.deepEqual(response, {
    settings: {},
    path: '/policies/371861/versions/1',
    query: {},
    body,
    method: 'PUT'
  });
});

test('normalizes a fetched Cloudlets Request Control version for PUT', () => {
  const cloudlets = apiRegistry.moduleFor('/cloudlets/v3/policies/371861/versions/1');
  assert.deepEqual(cloudlets.putPolicyVersionBody({
    id: 20079764,
    version: 1,
    immutable: true,
    description: null,
    policyId: 371861,
    matchRules: [{
      type: 'igMatchRule',
      matchURL: null,
      allowDeny: 'deny'
    }]
  }), {
    description: '',
    matchRules: [{
      type: 'igMatchRule',
      allowDeny: 'deny'
    }]
  });
});

test('normalizes Cloudlets policy version POST arguments', () => {
  const cloudlets = apiRegistry.moduleFor('/cloudlets/v3/policies/371861/versions');
  assert.deepEqual(cloudlets.postPolicyVersionBody(
    { policyId: 371861, matchRules: [] },
    { description: 'test' }
  ), {
    matchRules: [],
    description: 'test'
  });
});

test('discovers and routes JWT API by service prefix', () => {
  const jwtApi = apiRegistry.moduleFor('/jwt-api/v1/key-collections');
  assert.equal(jwtApi.name, 'JwtApi');
  assert.equal(jwtApi.prefix, '/jwt-api/v1');
  assert(jwtApi.methodPaths.GET.includes('/key-collections'));
  assert(jwtApi.methodPaths.POST.includes('/key-collections'));
  assert(apiRegistry.queryParameters().includes('collectionId'));
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

test('routes JWT API POST requests and preserves response status and body', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/jwt-api/v1/key-collections',
    {},
    { name: 'example' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { id: 12 } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/key-collections',
    query: {},
    body: { name: 'example' },
    method: 'POST'
  });
  assert.deepEqual(response, { statusCode: 201, body: { id: 12 } });
  assert.throws(
    () => apiRegistry.put({}, '/jwt-api/v1/key-collections', {}, { name: 'example' }),
    /No API module supports PUT path/
  );
});

test('completes JWT API collection and version identifiers', async () => {
  const requests = [];
  const requestGet = async (settings, path) => {
    requests.push(path);
    if (path === '/key-collections') {
      return { statusCode: 200, body: [{ id: 12 }, { id: 15 }] };
    }
    return { statusCode: 200, body: { versions: [{ id: 11 }, { id: 12 }] } };
  };
  const cache = new Map();

  const [collectionCandidates] = await apiRegistry.complete(
    '/jwt-api/v1/key-collections/',
    {},
    cache,
    requestGet
  );
  assert.deepEqual(collectionCandidates, [
    '/jwt-api/v1/key-collections/12',
    '/jwt-api/v1/key-collections/15'
  ]);

  const [versionCandidates] = await apiRegistry.complete(
    '/jwt-api/v1/key-collections/12/versions/',
    {},
    cache,
    requestGet
  );
  assert.deepEqual(versionCandidates, [
    '/jwt-api/v1/key-collections/12/versions/11',
    '/jwt-api/v1/key-collections/12/versions/12'
  ]);
  assert.deepEqual(requests, ['/key-collections', '/key-collections/12']);
});
