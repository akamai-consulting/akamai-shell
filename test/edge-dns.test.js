'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const apiRegistry = require('../src/api-registry');
const edgeDns = require('../src/apis/edge-dns');
const { createBackend } = require('../src/backend');
const { loadOpenApiCatalog } = require('../src/openapi-catalog');

test('routes documented Edge DNS recordset creation POST requests', async () => {
  const recordsets = [{
    name: 'as00',
    ttl: 90,
    type: 'CNAME'
  }];
  const body = { recordsets };
  let request;
  const response = await apiRegistry.dispatch(
    'POST',
    {},
    '/config-dns/v2/zones/cdn.nicedemo.net/recordsets',
    {},
    body,
    async (settings, path, query, requestBody, method) => {
      request = { settings, path, query, body: requestBody, method };
      return { statusCode: 204, body: null };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/zones/cdn.nicedemo.net/recordsets',
    query: {},
    body,
    method: 'POST'
  });
  assert.equal(response.statusCode, 204);
});

test('routes documented Edge DNS recordset replacement PUT requests', async () => {
  const body = { recordsets: [{ name: 'as00', ttl: 90, type: 'CNAME' }] };
  let request;
  const response = await apiRegistry.dispatch(
    'PUT',
    {},
    '/config-dns/v2/zones/cdn.nicedemo.net/recordsets',
    {},
    body,
    async (settings, path, query, requestBody, method) => {
      request = { settings, path, query, body: requestBody, method };
      return { statusCode: 204, body: null };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/zones/cdn.nicedemo.net/recordsets',
    query: {},
    body,
    method: 'PUT'
  });
  assert.equal(response.statusCode, 204);
});

test('accepts HTTPie recordsets body syntax for Edge DNS creation', async () => {
  let request;
  const backend = createBackend({
    input: new PassThrough(),
    output: new PassThrough(),
    requestGet: async (settings, path, query, body, method) => {
      request = { path, query, body, method };
      return { statusCode: 204, body: null };
    }
  });
  try {
    await backend.command(
      `post /config-dns/v2/zones/cdn.nicedemo.net/recordsets 'recordsets:=[{"name": "as00", "ttl": 90, "type": "CNAME"}]'`
    );
  } finally {
    await backend.shutdown();
  }

  assert.deepEqual(request, {
    path: '/zones/cdn.nicedemo.net/recordsets',
    query: {},
    body: { recordsets: [{ name: 'as00', ttl: 90, type: 'CNAME' }] },
    method: 'POST'
  });
});

test('submits an Edge DNS changelist with query parameters and no request body', async () => {
  let request;
  const backend = createBackend({
    input: new PassThrough(),
    output: new PassThrough(),
    requestGet: async (settings, path, query, body, method) => {
      request = { path, query, body, method };
      return { statusCode: 204, body: null };
    }
  });
  try {
    await backend.command(
      "post /config-dns/v2/changelists/cdn.nicedemo.net/submit comment=='Update test from API'"
    );
  } finally {
    await backend.shutdown();
  }

  assert.deepEqual(request, {
    path: '/changelists/cdn.nicedemo.net/submit',
    query: { comment: 'Update test from API' },
    body: undefined,
    method: 'POST'
  });
});

test('supports OpenAPI POST/PUT operations except activation and deletion workflows', () => {
  const catalog = loadOpenApiCatalog({ service: 'config-dns/v2' });
  const unsupportedPostPaths = new Set([
    '/proxies/{proxyId}/zones/delete-requests',
    '/zones/delete-requests',
    '/zones/{zone}/versions/{uuid}/recordsets/activate'
  ]);
  const supportedPostPaths = catalog.methodPaths.POST
    .filter((path) => !unsupportedPostPaths.has(path));
  assert.deepEqual(edgeDns.methodPaths.POST, supportedPostPaths);
  assert.deepEqual(edgeDns.methodPaths.PUT, catalog.methodPaths.PUT);
  assert.equal(edgeDns.methodPaths.DELETE, undefined);

  assert.throws(
    () => apiRegistry.dispatch(
      'POST', {}, '/config-dns/v2/zones/delete-requests', {}, {}
    ),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.dispatch(
      'POST',
      {},
      '/config-dns/v2/zones/cdn.nicedemo.net/versions/123/recordsets/activate',
      {},
      {}
    ),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.dispatch(
      'DELETE', {}, '/config-dns/v2/zones/cdn.nicedemo.net/key', {}, {}
    ),
    /No API module supports DELETE path/
  );
  assert(edgeDns.methodPaths.POST.includes('/changelists/{zone}/submit'));
  assert(edgeDns.methodPaths.POST.includes('/zones/{zone}/recordsets'));
});
