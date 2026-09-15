'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const caseManagement = require('../src/apis/case-management');

test('discovers Case Management using its documented service prefix', async () => {
  assert.equal(apiRegistry.moduleFor('/case-management/v3/cases').name, 'CaseManagement');
  assert.equal(caseManagement.prefix, '/case-management/v3');
  assert.deepEqual(caseManagement.methodPaths.PATCH, ['/cases/{caseId}']);

  let request;
  const response = await apiRegistry.get({}, '/case-management/v3/cases', {
    type: 'MY_ACTIVE_CASES'
  }, async (settings, path, query) => {
    request = { settings, path, query };
    return { statusCode: 200, body: { cases: [] } };
  });

  assert.deepEqual(request, {
    settings: {}, path: '/cases', query: { type: 'MY_ACTIVE_CASES' }
  });
  assert.equal(response.statusCode, 200);

  const failed = await apiRegistry.get({}, '/case-management/v3/cases/F-CS-1', {},
    async () => ({ statusCode: 429, body: { errors: ['rate limited'] } }));
  assert.deepEqual(failed, { statusCode: 429, body: { errors: ['rate limited'] } });
});

test('routes documented POST and PATCH methods and rejects unsupported methods', async () => {
  let request;
  await apiRegistry.post({}, '/case-management/v3/cases', {}, { subject: 'Outage' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { caseId: 'F-CS-1' } };
    });
  assert.deepEqual(request, {
    settings: {}, path: '/cases', query: {}, body: { subject: 'Outage' }, method: 'POST'
  });

  await caseManagement.dispatch({}, '/case-management/v3/cases/F-CS-1', 'PATCH', {},
    { subject: 'Updated' }, async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, body: { caseId: 'F-CS-1' } };
    });
  assert.deepEqual(request, {
    settings: {}, path: '/cases/F-CS-1', query: {},
    body: { subject: 'Updated' }, method: 'PATCH'
  });

  assert.throws(
    () => apiRegistry.put({}, '/case-management/v3/cases/F-CS-1', {}, { subject: 'x' }),
    /No API module supports PUT path/
  );
  assert.throws(
    () => caseManagement.dispatch({}, '/case-management/v3/cases', 'PATCH', {}, undefined),
    /PATCH is not supported/
  );
});

test('completes cases and nested attachment identifiers with caching', async () => {
  const cache = new Map();
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.deepEqual({ settings, query }, { settings: {}, query: {} });
    if (path === '/cases') {
      return { statusCode: 200, body: { cases: [{ caseId: 'F-CS-000004' }] } };
    }
    if (path === '/cases/F-CS-000004/attachments') {
      return { statusCode: 200, body: { attachments: [{ attachmentId: '0690f000001x4jt' }] } };
    }
    throw new Error(`unexpected ${path}`);
  };

  let [candidates] = await apiRegistry.complete(
    '/case-management/v3/cases/F-CS-0', {}, cache, requestGet
  );
  assert.deepEqual(candidates, ['/case-management/v3/cases/F-CS-000004']);
  [candidates] = await apiRegistry.complete(
    '/case-management/v3/cases/F-CS-000004/attachments/0690', {}, cache, requestGet
  );
  assert.deepEqual(candidates, [
    '/case-management/v3/cases/F-CS-000004/attachments/0690f000001x4jt'
  ]);
  await apiRegistry.complete('/case-management/v3/cases/F-CS-0', {}, cache, requestGet);
  assert.equal(calls, 2);
});

test('silently returns no completion matches for failed lookups', async () => {
  const [candidates] = await apiRegistry.complete(
    '/case-management/v3/cases/F-CS-', {}, new Map(),
    async () => ({ statusCode: 403, body: { error: 'forbidden' } })
  );
  assert.deepEqual(candidates, []);
});
