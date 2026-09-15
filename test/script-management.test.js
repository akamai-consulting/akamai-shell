'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');
const scriptManagement = require('../src/apis/script-management');

test('discovers Script Management and routes its documented methods', async () => {
  assert.equal(apiRegistry.moduleFor(
    '/script-management/v1/properties/123/hostnames/example.test/network/production/insights'
  ).name, 'ScriptManagement');
  assert.deepEqual(scriptManagement.methodPaths, {
    GET: [
      '/properties/{propertyId}/hostnames/{hostname}/network/{network}/insights',
      '/properties/{propertyId}/hostnames/{hostname}/network/{network}/policies'
    ],
    POST: [
      '/properties/{propertyId}/hostnames/{hostname}/network/{network}/policies'
    ]
  });

  let request;
  const response = await apiRegistry.get({}, '/script-management/v1/properties/123/hostnames/example.test/network/production/insights',
    { firstParty: 'false', accountSwitchKey: 'ask' },
    async (settings, path, query) => {
      request = { settings, path, query };
      return { statusCode: 200, body: { scripts: [] } };
    });
  assert.deepEqual(request, {
    settings: {},
    path: '/properties/123/hostnames/example.test/network/production/insights',
    query: { firstParty: 'false', accountSwitchKey: 'ask' }
  });
  assert.equal(response.statusCode, 200);
});

test('routes POST and rejects undocumented methods and paths', async () => {
  let request;
  const response = await apiRegistry.post({}, '/script-management/v1/properties/123/hostnames/example.test/network/production/policies',
    { accountSwitchKey: 'ask' }, { scripts: [] },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 201, body: { accepted: true } };
    });
  assert.deepEqual(request, {
    settings: {},
    path: '/properties/123/hostnames/example.test/network/production/policies',
    query: { accountSwitchKey: 'ask' },
    body: { scripts: [] },
    method: 'POST'
  });
  assert.equal(response.statusCode, 201);
  assert.throws(
    () => apiRegistry.put({}, '/script-management/v1/properties/123/hostnames/example.test/network/production/policies', {}, {}),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/script-management/v1/properties/123/hostnames/example.test/network/production/insights', {}, {}),
    /No API module supports POST path/
  );
});

test('preserves API error responses and completes static paths', async () => {
  const error = await apiRegistry.get({}, '/script-management/v1/properties/123/hostnames/example.test/network/production/insights',
    {}, async () => ({ statusCode: 403, body: { errors: ['denied'] } }));
  assert.deepEqual(error, { statusCode: 403, body: { errors: ['denied'] } });

  const [candidates] = await apiRegistry.complete(
    '/script-management/v1/properties/123/hostnames/example.test/network/production/',
    {}, new Map()
  );
  assert.deepEqual(candidates, [
    '/script-management/v1/properties/123/hostnames/example.test/network/production/insights',
    '/script-management/v1/properties/123/hostnames/example.test/network/production/policies'
  ]);
});
