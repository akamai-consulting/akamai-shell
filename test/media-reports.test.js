'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const mediaReports = require('../src/apis/media-reports');

const PREFIX = '/media-reports/v1';

test('discovers Media Reports with its documented prefix and GET operations', () => {
  assert.equal(apiRegistry.moduleFor(`${PREFIX}/media-services-live/http-ingest/data`).name,
    'MediaReports');
  assert(apiRegistry.modulesForMethod('GET', `${PREFIX}/msod/pmd/metrics`).includes(mediaReports));
  assert.throws(
    () => apiRegistry.moduleForMethod('POST', `${PREFIX}/msod/pmd/metrics`),
    /No API module supports POST path/
  );
});

test('routes Media Reports requests through the generic transport shape', async () => {
  let request;
  const response = await apiRegistry.get(
    {}, `${PREFIX}/media-services-live/http-ingest/data`,
    { dimensions: '1', metrics: '2', startDate: '01/01/2024', endDate: '01/02/2024' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { rows: [] } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/media-services-live/http-ingest/data',
    query: { dimensions: '1', metrics: '2', startDate: '01/01/2024', endDate: '01/02/2024' }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { rows: [] });
});

test('preserves API error responses from Media Reports', async () => {
  const error = { statusCode: 403, body: { title: 'Forbidden', detail: 'not authorized' } };
  const response = await apiRegistry.get({}, `${PREFIX}/msod/pmd/data`, {},
    async () => error);
  assert.deepEqual(response, error);
});

test('completes HTTP ingest data store identifiers and caches lookups', async () => {
  const cache = new Map();
  let requests = 0;
  const requestGet = async (settings, path) => {
    requests += 1;
    assert.equal(path, '/media-services-live/http-ingest/data-stores');
    return { statusCode: 200, body: [{ id: 102 }, { id: 203 }] };
  };

  const first = await mediaReports.complete(
    `${PREFIX}/media-services-live/http-ingest/data-stores/1`, {}, cache, requestGet
  );
  const second = await mediaReports.complete(
    `${PREFIX}/media-services-live/http-ingest/data-stores/1`, {}, cache, requestGet
  );

  assert.deepEqual(first[0], [
    `${PREFIX}/media-services-live/http-ingest/data-stores/102`
  ]);
  assert.deepEqual(second[0], first[0]);
  assert.equal(requests, 1);
});

test('completes origin shield data stores without matching unrelated collections', async () => {
  const [candidates] = await mediaReports.complete(
    `${PREFIX}/media-services-live/http-ingest/origin-shield/data-stores/5`,
    {}, new Map(), async (settings, path) => {
      assert.equal(path, '/media-services-live/http-ingest/origin-shield/data-stores');
      return { statusCode: 200, body: [{ id: 5500 }, { id: 6600 }] };
    }
  );
  assert.deepEqual(candidates, [
    `${PREFIX}/media-services-live/http-ingest/origin-shield/data-stores/5500`
  ]);
});
