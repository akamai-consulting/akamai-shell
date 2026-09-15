'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const ccu = require('../src/apis/ccu');

const PREFIX = '/ccu/v3';

test('loads CCU operations from the checked-in OpenAPI catalog', () => {
  assert.equal(ccu.name, 'ContentControlUtility');
  assert.equal(ccu.prefix, PREFIX);
  assert.equal(ccu.queryParameters.length, 0);
  assert.deepEqual(ccu.methodPaths.GET, undefined);
  assert.equal(ccu.methodPaths.POST.length, 7);
  assert(ccu.methodPaths.POST.includes('/invalidate/url/{network}'));
  assert(ccu.methodPaths.POST.includes('/rate-limit-status/{purge-type}'));
  assert(ccu.methodStaticPaths.POST.includes('/invalidate'));
  assert(ccu.methodStaticPaths.POST.includes('/invalidate/url'));
});

test('routes CCU POST requests with path, body, method, and status intact', async () => {
  let request;
  const response = await apiRegistry.post(
    { edgerc: 'credentials', edgercSection: 'default' },
    '/ccu/v3/invalidate/url/production',
    {},
    { objects: ['https://example.test/path'] },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, headers: { 'x-ratelimit-remaining': '9' }, body: { estimatedSeconds: 1 } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgerc: 'credentials', edgercSection: 'default' },
    path: '/invalidate/url/production',
    query: {},
    body: { objects: ['https://example.test/path'] },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.headers['x-ratelimit-remaining'], '9');
  assert.deepEqual(response.body, { estimatedSeconds: 1 });
});

test('rejects unsupported CCU methods and paths explicitly', () => {
  assert.throws(
    () => apiRegistry.get({}, '/ccu/v3/invalidate/url/production', {}),
    /No API module supports GET path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/ccu/v3/invalidate/url/production', {}),
    /POST requires a JSON body/
  );
  assert.throws(
    () => apiRegistry.post({}, '/ccu/v3/unknown/production', {}, {}),
    /No API module supports POST path/
  );
});

test('completes documented CCU POST paths without a dynamic lookup', async () => {
  const [rootCandidates] = await apiRegistry.completeMethod('POST', '/', {}, new Map());
  assert(rootCandidates.includes('/ccu/v3/invalidate'));
  assert(rootCandidates.includes('/ccu/v3/delete'));
  assert(rootCandidates.includes('/ccu/v3/rate-limit-status'));

  const [pathCandidates] = await apiRegistry.completeMethod(
    'POST', '/ccu/v3/invalidate/', {}, new Map()
  );
  assert(pathCandidates.includes('/ccu/v3/invalidate/cpcode'));
  assert(pathCandidates.includes('/ccu/v3/invalidate/tag'));
  assert(pathCandidates.includes('/ccu/v3/invalidate/url'));
});
