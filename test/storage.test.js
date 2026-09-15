'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');

test('discovers Storage using the documented service prefix', () => {
  const module = apiRegistry.moduleFor('/storage/v1/storage-groups');
  assert.equal(module.name, 'Storage');
  assert.equal(module.prefix, '/storage/v1');
  assert(apiRegistry.queryParameters().includes('storageGroupPurpose'));
});

test('routes documented Storage methods with relative paths and bodies', async () => {
  let request;
  const handler = async (settings, path, query, body, method) => {
    request = { settings, path, query, body, method };
    return { statusCode: 201, body: { storageGroupId: 12 } };
  };

  const response = await apiRegistry.post(
    { edgercSection: 'storage' },
    '/storage/v1/storage-groups',
    { accountSwitchKey: 'account' },
    { storageGroupName: 'media' },
    handler
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'storage' },
    path: '/storage-groups',
    query: { accountSwitchKey: 'account' },
    body: { storageGroupName: 'media' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);

  await apiRegistry.put({}, '/storage/v1/storage-groups/12', {}, { name: 'updated' }, handler);
  assert.equal(request.path, '/storage-groups/12');
  assert.equal(request.method, 'PUT');
  assert.throws(
    () => apiRegistry.dispatch('DELETE', {}, '/storage/v1/storage-groups/12', {}),
    /No API module supports DELETE path/
  );
});

test('completes Storage identifiers from cached collection responses', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/storage-groups', query: {} });
    return {
      statusCode: 200,
      body: { items: [{ storageGroupId: 12 }, { storageGroupId: 34 }] }
    };
  };

  const first = await apiRegistry.complete(
    '/storage/v1/storage-groups/1', {}, cache, requestGet
  );
  const second = await apiRegistry.complete(
    '/storage/v1/storage-groups/3', {}, cache, requestGet
  );

  assert.deepEqual(first[0], ['/storage/v1/storage-groups/12']);
  assert.deepEqual(second[0], ['/storage/v1/storage-groups/34']);
  assert.equal(calls, 1);
});

test('preserves response status and error body through Storage routing', async () => {
  const response = await apiRegistry.get(
    {},
    '/storage/v1/upload-accounts',
    {},
    async () => ({ statusCode: 403, body: { title: 'Forbidden', detail: 'denied' } })
  );
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { title: 'Forbidden', detail: 'denied' });
});
