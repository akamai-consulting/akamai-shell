'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const cam = require('../src/apis/cam');

const PREFIX = '/cam/v1';

test('loads CAM operations from the OpenAPI catalog', () => {
  assert.equal(cam.name, 'CloudAccessManager');
  assert.equal(cam.prefix, PREFIX);
  assert.deepEqual(cam.queryParameters, ['accountSwitchKey', 'versionGuid']);
  assert.equal(cam.methodPaths.GET.length, 9);
  assert.equal(cam.methodPaths.POST.length, 2);
  assert.equal(cam.methodPaths.DELETE.length, 1);
  assert(cam.methodPaths.GET.includes('/access-keys/{accessKeyUid}/versions/{version}'));
  assert(cam.methodPaths.DELETE.includes('/access-keys/{accessKeyUid}/versions/{version}'));
});

test('routes CAM requests with relative path and response status intact', async () => {
  let request;
  const response = await apiRegistry.post(
    { edgerc: 'credentials', edgercSection: 'default' },
    '/cam/v1/access-keys',
    { accountSwitchKey: '1-ABC' },
    { accessKeyName: 'example' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, headers: { location: '/cam/v1/access-keys/1' }, body: { requestId: 7 } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgerc: 'credentials', edgercSection: 'default' },
    path: '/access-keys',
    query: { accountSwitchKey: '1-ABC' },
    body: { accessKeyName: 'example' },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { requestId: 7 });
});

test('preserves CAM DELETE support and rejects unsupported paths', async () => {
  const response = await apiRegistry.dispatch(
    'DELETE',
    { edgerc: 'credentials', edgercSection: 'default' },
    '/cam/v1/access-keys/123/versions/2',
    {},
    undefined,
    async (settings, path, query, body, method) => ({
      statusCode: 202, headers: {}, body: { method, path, query, body }
    })
  );
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.method, 'DELETE');
  assert.equal(response.body.path, '/access-keys/123/versions/2');
  assert.throws(
    () => apiRegistry.get({}, '/cam/v1/unknown'),
    /No API module supports GET path/
  );
});

test('completes CAM access keys and versions from collection responses', async () => {
  const requests = [];
  const requestGet = async (settings, path) => {
    requests.push(path);
    if (path === '/access-keys') {
      return { statusCode: 200, headers: {}, body: { accessKeys: [{ accessKeyUid: 123 }, { accessKeyUid: 456 }] } };
    }
    return { statusCode: 200, headers: {}, body: { accessKeyVersions: [{ version: 1 }, { version: 2 }] } };
  };
  const cache = new Map();
  const [keys] = await apiRegistry.completeMethod(
    'GET', '/cam/v1/access-keys/', {}, cache, requestGet
  );
  assert(keys.includes('/cam/v1/access-keys/123'));
  assert(keys.includes('/cam/v1/access-keys/456'));
  const [versions] = await apiRegistry.completeMethod(
    'GET', '/cam/v1/access-keys/123/versions/', {}, cache, requestGet
  );
  assert(versions.includes('/cam/v1/access-keys/123/versions/1'));
  assert.deepEqual(requests, ['/access-keys', '/access-keys/123/versions']);
});
