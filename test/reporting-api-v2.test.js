'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const reporting = require('../src/apis/reporting-api-v2');

test('discovers Reporting API v2 with its documented methods', () => {
  assert.equal(apiRegistry.moduleFor('/reporting-api/v2/reports').name, 'ReportingApiV2');
  assert(apiRegistry.modulesForMethod('GET', '/reporting-api/v2/reports').includes(reporting));
  assert(apiRegistry.modulesForMethod(
    'POST',
    '/reporting-api/v2/reports/delivery/traffic/current/data'
  ).includes(reporting));
  assert.throws(
    () => apiRegistry.moduleForMethod('PUT', '/reporting-api/v2/reports'),
    /No API module supports PUT path/
  );
});

test('routes Reporting API v2 requests through the generic transport shape', async () => {
  let request;
  const response = await apiRegistry.post(
    {},
    '/reporting-api/v2/reports/delivery/traffic/current/data',
    { async: true },
    { metrics: ['edgeHitsSum'] },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { accepted: true } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/reports/delivery/traffic/current/data',
    query: { async: true },
    body: { metrics: ['edgeHitsSum'] },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { accepted: true });
});

test('completes Reporting API v2 identifiers from report collections and caches lookups', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    if (path === '/reports') {
      return {
        statusCode: 200,
        body: {
          reports: [
            { reportLink: '/reporting-api/v2/reports/delivery/traffic/current' },
            { reportLink: '/reporting-api/v2/reports/delivery/video/overview' }
          ]
        }
      };
    }
    throw new Error(`unexpected completion path ${path}`);
  };

  const first = await reporting.complete(
    '/reporting-api/v2/reports/d', {}, cache, requestGet
  );
  const second = await reporting.complete(
    '/reporting-api/v2/reports/d', {}, cache, requestGet
  );

  assert.deepEqual(first[0], ['/reporting-api/v2/reports/delivery']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});
