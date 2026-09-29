'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRecorder } = require('../src/recorder');

test('keeps only the most recent request in auto mode', () => {
  const recorder = createRecorder();
  recorder.setMode('auto');
  const first = recorder.begin({
    method: 'GET',
    path: '/papi/v1/properties',
    headers: { Authorization: 'secret' },
    qs: {},
  });
  recorder.complete(first, {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: { properties: [] }
  });

  const second = recorder.begin({
    method: 'GET',
    path: '/papi/v1/groups',
    headers: {},
    qs: {}
  });
  recorder.complete(second, {
    statusCode: 200,
    headers: {},
    body: { groups: [] }
  });

  assert.equal(recorder.mode, 'auto');
  assert.equal(recorder.records.length, 1);
  const record = JSON.parse(recorder.jsonl());
  assert.equal(record.request.path, '/papi/v1/groups');
  assert.equal(record.response.statusCode, 200);
});

test('renders captured records as HTTP-style messages', () => {
  const recorder = createRecorder();
  recorder.setMode('on');
  const entry = recorder.begin({
    method: 'POST',
    path: '/cloudlets/v3/policies',
    headers: { Accept: 'application/json' },
    qs: {},
    body: { name: 'demo' }
  });
  recorder.complete(entry, {
    statusCode: 201,
    headers: { location: '/policies/1' },
    body: { id: 1 }
  });

  const output = recorder.http();
  assert.match(output, /POST \/cloudlets\/v3\/policies HTTP\/1\.1/);
  assert.match(output, /HTTP\/1\.1 201/);
  assert.match(output, /"name":"demo"/);
});

test('renders HTTP error responses instead of an empty status', () => {
  const recorder = createRecorder();
  recorder.setMode('on');
  const entry = recorder.begin({
    method: 'PUT',
    path: '/cloudlets/api/v2/policies/371982/versions/4',
    headers: { Accept: 'application/json' },
    qs: {}
  });
  recorder.complete(entry, {
    statusCode: 400,
    headers: { 'content-type': 'application/problem+json' },
    body: { title: 'Invalid request' }
  }, {
    statusCode: 400,
    message: 'Request failed',
    body: { title: 'Invalid request' }
  });

  const output = recorder.http();
  assert.match(output, /HTTP\/1\.1 400/);
  assert.match(output, /content-type: application\/problem\+json/);
  assert.match(output, /"title":"Invalid request"/);
});
