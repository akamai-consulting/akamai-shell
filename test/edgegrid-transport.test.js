'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { request, requestMethod } = require('../src/edgegrid-transport');
const { createRecorder } = require('../src/recorder');

test('applies accountSwitchKey and parameter defaults to generic API requests', async () => {
  let sent;
  await request({
    edgerc: '/tmp/test-edgerc',
    edgercSection: 'dns',
    accountSwitchKey: '1-ABC:1-DEF',
    parameterDefaults: { pageSize: '25' }
  }, '/zones', { pageSize: '10' }, () => ({
    auth(value) {
      sent = value;
      return this;
    },
    send(callback) {
      callback(null, { status: 200, headers: {} }, '{}');
    }
  }), '/config-dns/v2');

  assert.deepEqual(sent.qs, {
    pageSize: '10',
    accountSwitchKey: '1-ABC:1-DEF'
  });
});

test('merges custom headers case-insensitively with transport defaults', async () => {
  let sent;
  await requestMethod({
    edgerc: '/tmp/test-edgerc',
    edgercSection: 'cps'
  }, '/enrollments', 'GET', {}, undefined, () => ({
    auth(value) {
      sent = value;
      return this;
    },
    send(callback) {
      callback(null, { status: 200, headers: {} }, '{}');
    }
  }), '/cps/v2', { Accept: 'application/json', 'X-Default': 'keep' }, {
    accept: 'application/vnd.akamai.cps.enrollments.v11+json'
  });

  assert.deepEqual(sent.headers, {
    Accept: 'application/vnd.akamai.cps.enrollments.v11+json',
    'X-Default': 'keep'
  });
});

test('constructs signed arbitrary-method JSON requests with response metadata', async () => {
  let sent;
  const response = await requestMethod({
    edgerc: '/tmp/test-edgerc',
    edgercSection: 'diagnostics',
    accountSwitchKey: '1-ACCOUNT',
    parameterDefaults: { region: 'us' }
  }, '/curl', 'post', { region: 'eu' }, { url: 'https://example.test', follow: true },
  () => ({
    auth(value) {
      sent = value;
      return this;
    },
    send(callback) {
      callback(null, { status: 202, headers: { location: '/requests/1' } }, '{"requestId":"1"}');
    }
  }), '/edge-diagnostics/v1');

  assert.deepEqual(sent, {
    path: '/edge-diagnostics/v1/curl',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    qs: { region: 'eu', accountSwitchKey: '1-ACCOUNT' },
    body: { url: 'https://example.test', follow: true }
  });

  test('records transport requests and responses', async () => {
    const recorder = createRecorder();
    recorder.setMode('on');
    await request({
      edgerc: '/tmp/test-edgerc',
      edgercSection: 'papi',
      recorder
    }, '/properties', {}, () => ({
      auth() { return this; },
      send(callback) {
        callback(null, { status: 200, headers: {} }, '{"ok":true}');
      }
    }), '/papi/v1');

    assert.equal(recorder.records.length, 1);
    assert.equal(JSON.parse(recorder.jsonl()).response.body.ok, true);
  });
  assert.deepEqual(response, {
    statusCode: 202,
    headers: { location: '/requests/1' },
    body: { requestId: '1' }
  });
});
