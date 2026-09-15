'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers ETP Report by its documented service prefix', () => {
  const apiModule = apiRegistry.moduleFor('/etp-report/v3/ioc/changes');
  assert.equal(apiModule.name, 'EtpReport');
  assert.equal(apiModule.prefix, '/etp-report/v3');
  assert(apiModule.queryParameters.includes('startTimeSec'));
});

test('routes ETP Report GET requests without changing the API path', async () => {
  let request;
  const response = await apiRegistry.get({}, '/etp-report/v3/ioc/changes',
    { startTimeSec: '1', endTimeSec: '2' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { changes: [] } };
    });

  assert.deepEqual(request, {
    settings: {},
    path: '/ioc/changes',
    query: { startTimeSec: '1', endTimeSec: '2' }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { changes: [] });
});

test('routes documented ETP Report POST and PUT operations', async () => {
  const requests = [];
  const request = async (settings, path, query, body, method) => {
    requests.push({ settings, path, query, body, method });
    return { statusCode: method === 'POST' ? 202 : 200, body: { ok: true } };
  };

  await apiRegistry.post({}, '/etp-report/v3/configs/123/schedules', {},
    { reportTemplate: 'IOC' }, request);
  await apiRegistry.put({}, '/etp-report/v3/configs/123/schedules/456',
    { accountSwitchKey: 'acct' }, { status: 'DISABLED' }, request);

  assert.deepEqual(requests, [
    {
      settings: {},
      path: '/configs/123/schedules',
      query: {},
      body: { reportTemplate: 'IOC' },
      method: 'POST'
    },
    {
      settings: {},
      path: '/configs/123/schedules/456',
      query: { accountSwitchKey: 'acct' },
      body: { status: 'DISABLED' },
      method: 'PUT'
    }
  ]);
});

test('rejects unsupported ETP Report methods and paths', () => {
  assert.throws(
    () => apiRegistry.post({}, '/etp-report/v3/ioc/changes', {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.put({}, '/etp-report/v3/configs/123/schedules', {}, {}),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/etp-report/v3/configs/123/schedules', {}),
    /POST requires a JSON body/
  );
});

test('completes ETP Report schedule identifiers from the collection response', async () => {
  let calls = 0;
  const [candidates, partial] = await apiRegistry.complete(
    '/etp-report/v3/configs/123/schedules/4',
    {},
    new Map(),
    async (settings, path, query) => {
      calls += 1;
      assert.equal(path, '/configs/123/schedules');
      assert.deepEqual(query, {});
      return { statusCode: 200, body: [{ scheduleId: 42 }, { scheduleId: 99 }] };
    }
  );

  assert.equal(partial, '/etp-report/v3/configs/123/schedules/4');
  assert.deepEqual(candidates, ['/etp-report/v3/configs/123/schedules/42']);
  assert.equal(calls, 1);
});

test('does not expose DELETE operations even though OpenAPI documents them', () => {
  assert.throws(
    () => apiRegistry.dispatch('DELETE', {}, '/etp-report/v3/configs/123/schedules/456'),
    /No API module supports DELETE path/
  );
});
