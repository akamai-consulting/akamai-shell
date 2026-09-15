'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const eventViewer = require('../src/apis/event-viewer');

const PREFIX = '/event-viewer-api/v1';

test('discovers Event Viewer using its documented service prefix and catalog', () => {
  assert.equal(eventViewer.name, 'EventViewer');
  assert.equal(eventViewer.prefix, PREFIX);
  assert.deepEqual(eventViewer.methodPaths.GET, ['/event-types', '/events']);
  assert.deepEqual(eventViewer.queryParameters, [
    'accountSwitchKey',
    'eventTypeId',
    'start',
    'end',
    'afterEventId',
    'beforeEventId',
    'username',
    'limit'
  ]);
  assert.equal(apiRegistry.moduleFor(`${PREFIX}/events`), eventViewer);
});

test('routes Event Viewer GET requests and preserves successful response data', async () => {
  let request;
  const response = await apiRegistry.get(
    { edgercSection: 'test' },
    `${PREFIX}/events`,
    { eventTypeId: 50, limit: 10 },
    async (settings, path, query) => {
      request = { settings, path, query };
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { events: [{ eventId: 'event-1' }] }
      };
    }
  );

  assert.deepEqual(request, {
    settings: { edgercSection: 'test' },
    path: '/events',
    query: { eventTypeId: 50, limit: 10 }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { events: [{ eventId: 'event-1' }] });
});

test('preserves Event Viewer error status and body and rejects unsupported methods', async () => {
  const errorResponse = {
    statusCode: 400,
    headers: { 'content-type': 'application/problem+json' },
    body: { title: 'Invalid request', detail: 'The date range is invalid' }
  };
  const response = await apiRegistry.get(
    {},
    `${PREFIX}/events`,
    {},
    async () => errorResponse
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, errorResponse.body);
  assert.throws(
    () => apiRegistry.post({}, `${PREFIX}/events`, {}, {}),
    /No API module supports POST path/
  );
  assert.throws(
    () => apiRegistry.get({}, `${PREFIX}/unknown`, {}),
    /No API module supports GET path/
  );
});

test('completes documented Event Viewer paths without a dynamic lookup', async () => {
  const [rootCandidates] = await apiRegistry.completeMethod('GET', `${PREFIX}/`, {}, new Map());
  assert.deepEqual(rootCandidates, [`${PREFIX}/event-types`, `${PREFIX}/events`]);

  const [partialCandidates] = await apiRegistry.complete(
    `${PREFIX}/event`, {}, new Map()
  );
  assert.deepEqual(partialCandidates, [`${PREFIX}/event-types`, `${PREFIX}/events`]);
});
