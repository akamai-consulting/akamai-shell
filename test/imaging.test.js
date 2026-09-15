'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const apiRegistry = require('../src/api-registry');
const imaging = require('../src/apis/imaging');
const transport = require('../src/edgegrid-transport');

test('discovers Imaging using the documented service prefix and methods', () => {
  assert.equal(apiRegistry.moduleFor('/imaging/v2/policysets').name, 'Imaging');
  assert.equal(imaging.prefix, '/imaging/v2');
  assert(apiRegistry.modulesForMethod('GET', '/imaging/v2/policysets').includes(imaging));
  assert(apiRegistry.modulesForMethod('POST', '/imaging/v2/policysets').includes(imaging));
  assert(apiRegistry.modulesForMethod('PUT', '/imaging/v2/policysets/abc').includes(imaging));
  assert.throws(
    () => apiRegistry.moduleForMethod('DELETE', '/imaging/v2/policysets/abc'),
    /No API module supports DELETE path/
  );
});

test('routes Imaging writes with body, query, and contextual headers', async () => {
  let request;
  await apiRegistry.put(
    { contractId: 'ctr_1', policySetId: 'ps_1' },
    '/imaging/v2/policysets/abc',
    { accountSwitchKey: 'ask' },
    { name: 'updated' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 200, body: { id: 'abc' } };
    }
  );
  assert.deepEqual(request, {
    settings: { contractId: 'ctr_1', policySetId: 'ps_1' },
    path: '/policysets/abc',
    query: { accountSwitchKey: 'ask' },
    body: { name: 'updated' },
    method: 'PUT'
  });

  test('constructs generic Imaging requests with documented headers and preserves responses', async () => {
    const original = transport.requestMethod;
    let request;
    transport.requestMethod = async (settings, path, method, query, body, client, prefix, headers) => {
      request = { settings, path, method, query, body, prefix, headers };
      return { statusCode: 400, headers: { 'x-request-id': 'r1' }, body: { error: 'invalid' } };
    };
    try {
      const response = await imaging.get(
        { contractId: 'ctr_1', policySetId: 'ps_1' },
        '/imaging/v2/policysets',
        { accountSwitchKey: 'ask' }
      );
      assert.deepEqual(request, {
        settings: { contractId: 'ctr_1', policySetId: 'ps_1' },
        path: '/policysets',
        method: 'GET',
        query: { accountSwitchKey: 'ask' },
        body: undefined,
        prefix: '/imaging/v2',
        headers: { Accept: 'application/json', Contract: 'ctr_1', 'Policy-Set': 'ps_1' }
      });
      assert.deepEqual(response, {
        statusCode: 400,
        headers: { 'x-request-id': 'r1' },
        body: { error: 'invalid' }
      });
    } finally {
      transport.requestMethod = original;
    }
  });
});

test('completes Imaging identifiers and caches collection lookups', async () => {
  let calls = 0;
  const requestGet = async (settings, path, query) => {
    calls += 1;
    assert.equal(path, '/policysets');
    assert.deepEqual(query, {});
    return { statusCode: 200, body: [{ id: 'alpha' }, { id: 'beta' }] };
  };
  const cache = new Map();
  const first = await imaging.complete('/imaging/v2/policysets/a', {}, cache, requestGet);
  const second = await imaging.complete('/imaging/v2/policysets/a', {}, cache, requestGet);
  assert.deepEqual(first[0], ['/imaging/v2/policysets/alpha']);
  assert.deepEqual(second[0], first[0]);
  assert.equal(calls, 1);
});
