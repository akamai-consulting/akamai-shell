'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const events = require('../src/apis/events');

test('discovers the Events v3 prefix and documented supported methods', () => {
  assert.equal(events.prefix, '/events/v3');
  assert(events.methodPaths.GET.includes('/events'));
  assert(events.methodPaths.GET.includes('/events/{eventId}'));
  assert(events.methodPaths.GET.includes('/tags'));
  assert(events.methodPaths.POST.includes('/events'));
  assert(events.methodPaths.PUT.includes('/events/{eventId}'));
  assert.equal(events.methodPaths.DELETE, undefined);
  assert(events.queryParameters.includes('customerEventId'));
  assert(events.queryParameters.includes('accountSwitchKey'));
});

test('constructs relative requests for GET and JSON writes', async () => {
  const calls = [];
  const request = async (...args) => {
    calls.push(args);
    return { statusCode: 201, body: { ok: true } };
  };
  const settings = {};

  await events.get(settings, '/events/v3/events', { page: 2 }, request);
  await events.dispatch(settings, '/events/v3/events', 'POST', {}, { name: 'x' }, request);
  await events.dispatch(settings, '/events/v3/events/12', 'PUT', {}, { version: 0 }, request);

  assert.deepEqual(calls, [
    [settings, '/events', { page: 2 }],
    [settings, '/events', {}, { name: 'x' }, 'POST'],
    [settings, '/events/12', {}, { version: 0 }, 'PUT']
  ]);
});

test('rejects unsupported method and path combinations', () => {
  assert.throws(
    () => events.dispatch({}, '/events/v3/events/1', 'DELETE', {}, {}),
    /DELETE is not supported/
  );
  assert.throws(
    () => events.dispatch({}, '/events/v3/tags', 'POST', {}, {}),
    /POST is not supported/
  );
});

test('completes event IDs from the Events collection response', async () => {
  let requests = 0;
  const [candidates] = await events.complete(
    '/events/v3/events/1',
    {},
    new Map(),
    async (_settings, path) => {
      requests += 1;
      assert.equal(path, '/events');
      return { statusCode: 200, body: { data: [{ id: 1 }, { id: 12 }, { id: 20 }] } };
    }
  );

  assert.deepEqual(candidates, ['/events/v3/events/1', '/events/v3/events/12']);
  assert.equal(requests, 1);
});
