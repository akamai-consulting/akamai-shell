'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const taas = require('../src/apis/taas');

test('discovers TaaS using the documented service prefix and methods', () => {
  assert.equal(taas.prefix, '/taas/v2');
  assert.equal(apiRegistry.moduleFor('/taas/v2/revocation-lists').name, 'TaaS');
  assert.deepEqual(Object.keys(taas.methodPaths).sort(), ['DELETE', 'GET', 'POST']);
  assert(taas.methodPaths.POST.includes('/revocation-lists'));
  assert(taas.methodPaths.DELETE.includes('/revocation-lists/{revocationListId}'));
  assert.throws(
    () => apiRegistry.moduleForMethod('PUT', '/taas/v2/revocation-lists'),
    /No API module supports PUT path/
  );
});

test('routes TaaS requests with the service-relative path and preserves responses', async () => {
  let request;
  const response = await apiRegistry.post(
    { edgercSection: 'test' },
    '/taas/v2/revocation-lists',
    { accountSwitchKey: 'account' },
    { name: 'customer-list' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, headers: { location: '/taas/v2/revocation-lists/1' },
        body: { id: 1 } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/revocation-lists',
    query: { accountSwitchKey: 'account' },
    body: { name: 'customer-list' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { id: 1 });
  assert.deepEqual(response.headers, { location: '/taas/v2/revocation-lists/1' });
});

test('preserves TaaS API error status and body', async () => {
  const response = await apiRegistry.get(
    {},
    '/taas/v2/revocation-lists/7/identifiers',
    {},
    async () => ({
      statusCode: 404,
      headers: { 'content-type': 'application/json' },
      body: { title: 'Not Found', detail: 'Revocation list does not exist' }
    })
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    title: 'Not Found', detail: 'Revocation list does not exist'
  });
});

test('routes documented TaaS DELETE and does not treat unsupported paths as GET', async () => {
  let request;
  const response = await apiRegistry.dispatch(
    'DELETE', {}, '/taas/v2/revocation-lists/7', { accountSwitchKey: 'account' },
    undefined,
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 204, body: null };
    }
  );

  assert.deepEqual(request, {
    settings: {}, path: '/revocation-lists/7',
    query: { accountSwitchKey: 'account' }, body: undefined, method: 'DELETE'
  });
  assert.equal(response.statusCode, 204);
  assert.equal(response.body, null);
  assert.throws(
    () => apiRegistry.get({}, '/taas/v2/revocation-lists/7', {}),
    /No API module supports GET path/
  );
});

test('completes TaaS revocation list and token identifiers with caching', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual(settings, {});
    assert.deepEqual(query, {});
    if (path === '/revocation-lists') {
      return { statusCode: 200, body: [{ id: 12 }, { id: 34 }] };
    }
    if (path === '/revocation-lists/12/identifiers') {
      return { statusCode: 200, body: [{ id: 'token-a' }, { id: 'token-b' }] };
    }
    throw new Error(`unexpected completion path ${path}`);
  };

  let [candidates] = await taas.complete('/taas/v2/revocation-lists/1', {}, cache, requestGet);
  assert.deepEqual(candidates, ['/taas/v2/revocation-lists/12']);
  [candidates] = await taas.complete('/taas/v2/revocation-lists/3', {}, cache, requestGet);
  assert.deepEqual(candidates, ['/taas/v2/revocation-lists/34']);
  assert.equal(calls, 1);

  [candidates] = await taas.complete(
    '/taas/v2/revocation-lists/12/identifiers/token',
    {}, cache, requestGet
  );
  assert.deepEqual(candidates, [
    '/taas/v2/revocation-lists/12/identifiers/token-a',
    '/taas/v2/revocation-lists/12/identifiers/token-b'
  ]);
  assert.equal(calls, 2);
});

test('silently returns no candidates when TaaS completion lookup fails', async () => {
  const [candidates] = await taas.complete(
    '/taas/v2/revocation-lists/1', {}, new Map(),
    async () => ({ statusCode: 403, body: { errors: ['denied'] } })
  );
  assert.deepEqual(candidates, []);
});
