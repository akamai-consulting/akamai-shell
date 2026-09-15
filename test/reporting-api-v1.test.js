'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const reportingApi = require('../src/apis/reporting-api-v1');

test('loads Reporting API v1 with the documented service prefix and methods', () => {
  assert.equal(reportingApi.name, 'ReportingApiV1');
  assert.equal(reportingApi.prefix, '/reporting-api/v1');
  assert(reportingApi.methodPaths.GET.includes('/reports'));
  assert(reportingApi.methodPaths.GET.includes('/reports/{name}/versions/{version}'));
  assert.deepEqual(reportingApi.methodPaths.POST, [
    '/reports/{name}/versions/{version}/report-data'
  ]);
  assert(reportingApi.queryParameters.includes('start'));
  assert(reportingApi.queryParameters.includes('metrics'));
});

test('routes documented report generation POST and preserves responses', async () => {
  let request;
  const response = await apiRegistry.post(
    { edgercSection: 'test' },
    '/reporting-api/v1/reports/traffic/versions/2/report-data',
    { start: '2024-01-01' },
    { objectIds: ['1'] },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 400, headers: { 'x-request-id': 'request' }, body: { error: 'invalid' } };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/reports/traffic/versions/2/report-data',
    query: { start: '2024-01-01' },
    body: { objectIds: ['1'] },
    method: 'POST'
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: 'invalid' });
});

test('rejects unsupported Reporting API methods and completes report identifiers', async () => {
  assert.throws(
    () => apiRegistry.put({}, '/reporting-api/v1/reports/traffic', {}, {}),
    /No API module supports PUT path/
  );

  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, path, query }, { settings: {}, path: '/reports', query: {} });
    return {
      statusCode: 200,
      body: [{ name: 'traffic' }, { name: 'security' }]
    };
  };
  let [candidates] = await apiRegistry.complete(
    '/reporting-api/v1/reports/tr',
    {},
    cache,
    requestGet
  );
  assert.deepEqual(candidates, ['/reporting-api/v1/reports/traffic']);
  [candidates] = await apiRegistry.complete(
    '/reporting-api/v1/reports/se',
    {},
    cache,
    requestGet
  );
  assert.deepEqual(candidates, ['/reporting-api/v1/reports/security']);
  assert.equal(calls, 1);
});
