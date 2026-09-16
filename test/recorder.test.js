'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRecorder } = require('../src/recorder');

test('captures one request in auto mode and then stops', () => {
  const recorder = createRecorder();
  recorder.setMode('auto');
  const entry = recorder.begin({
    method: 'GET',
    path: '/papi/v1/properties',
    headers: { Authorization: 'secret' },
    qs: {},
  });
  recorder.complete(entry, {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: { properties: [] }
  });

  assert.equal(recorder.mode, 'off');
  assert.equal(recorder.records.length, 1);
  const record = JSON.parse(recorder.jsonl());
  assert.equal(record.request.headers.Authorization, '[REDACTED]');
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
