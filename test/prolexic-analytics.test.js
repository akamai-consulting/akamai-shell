'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const prolexicAnalytics = require('../src/apis/prolexic-analytics');

test('discovers Prolexic Analytics with its documented prefix and methods', () => {
  assert.equal(apiRegistry.moduleFor('/prolexic-analytics/v2/metrics').name,
    'ProlexicAnalytics');
  assert.equal(prolexicAnalytics.prefix, '/prolexic-analytics/v2');
  assert(prolexicAnalytics.methodPaths.GET.includes(
    '/attack-reports/contract/{contract}/start/{start}/end/{end}'
  ));
  assert(prolexicAnalytics.methodPaths.POST.includes('/metrics'));
  assert.throws(
    () => apiRegistry.put({}, '/prolexic-analytics/v2/metrics', {}, {}),
    /No API module supports PUT path/
  );
});

test('routes Prolexic Analytics requests with paths, methods, query, and body', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/prolexic-analytics/v2/metrics',
    { accountSwitchKey: 'ask' },
    { metric: 'bandwidthIn' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { accepted: true } };
    }
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/metrics',
    query: { accountSwitchKey: 'ask' },
    body: { metric: 'bandwidthIn' },
    method: 'POST'
  });
  assert.deepEqual(response, { statusCode: 202, body: { accepted: true } });
});

test('preserves API error responses from Prolexic Analytics', async () => {
  const response = await apiRegistry.get(
    {},
    '/prolexic-analytics/v2/customer/names',
    {},
    async () => ({ statusCode: 403, body: { detail: 'forbidden' } })
  );
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { detail: 'forbidden' });
});

test('completes contract identifiers from customer names and caches the lookup', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path, query) => {
    requests += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/customer/names', query: {} });
    return {
      statusCode: 200,
      body: { customerNames: [{ contractId: 'C-ALPHA' }, { contractId: 'C-BETA' }] }
    };
  };

  const first = await apiRegistry.complete(
    '/prolexic-analytics/v2/metric-types/C-A', {}, cache, requestGet
  );
  const second = await apiRegistry.complete(
    '/prolexic-analytics/v2/metric-types/C-A', {}, cache, requestGet
  );
  assert.deepEqual(first[0], ['/prolexic-analytics/v2/metric-types/C-ALPHA']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});

test('returns no completion candidates when the lookup fails', async () => {
  const [candidates] = await apiRegistry.complete(
    '/prolexic-analytics/v2/events/contract/C-', {}, new Map(),
    async () => ({ statusCode: 403, body: { detail: 'forbidden' } })
  );
  assert.deepEqual(candidates, []);
});
