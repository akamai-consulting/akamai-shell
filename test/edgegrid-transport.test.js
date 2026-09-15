'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { request } = require('../src/edgegrid-transport');

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
