'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const cps = require('../src/apis/cps');

test('discovers CPS v2 with its documented supported methods', () => {
  assert.equal(apiRegistry.moduleFor('/cps/v2/enrollments').name, 'CPS');
  assert.equal(cps.prefix, '/cps/v2');
  assert(apiRegistry.modulesForMethod('GET', '/cps/v2/enrollments').includes(cps));
  assert(apiRegistry.modulesForMethod('POST', '/cps/v2/enrollments').includes(cps));
  assert(apiRegistry.modulesForMethod('PUT', '/cps/v2/enrollments/123').includes(cps));
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/cps/v2/enrollments/123'),
    /No API module supports DELETE path/
  );
});

test('routes CPS requests without changing the service-relative path', async () => {
  let request;
  const response = await apiRegistry.post(
    {}, '/cps/v2/enrollments', { contractId: 'ctr_1' },
    { csr: { cn: 'www.example.com' } },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { location: '/cps/v2/enrollments/42' } };
    }
  );
  assert.deepEqual(request, {
    settings: {},
    path: '/enrollments',
    query: { contractId: 'ctr_1' },
    body: { csr: { cn: 'www.example.com' } },
    method: 'POST'
  });
  assert.equal(response.statusCode, 202);
});

test('completes enrollment and pending change identifiers using cached lookups', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    if (path === '/enrollments') {
      return {
        statusCode: 200,
        body: {
          enrollments: [
            { location: '/cps/v2/enrollments/42' },
            { location: '/cps/v2/enrollments/77' }
          ]
        }
      };
    }
    return {
      statusCode: 200,
      body: { pendingChanges: ['/cps/v2/enrollments/42/changes/901'] }
    };
  };

  let result = await cps.complete('/cps/v2/enrollments/4', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/cps/v2/enrollments/42']);
  result = await cps.complete('/cps/v2/enrollments/4', {}, cache, requestGet);
  assert.deepEqual(result[0], ['/cps/v2/enrollments/42']);
  assert.equal(requests, 1);

  result = await cps.complete(
    '/cps/v2/enrollments/42/changes/9', {}, cache, requestGet
  );
  assert.deepEqual(result[0], ['/cps/v2/enrollments/42/changes/901']);
  assert.equal(requests, 2);
});
