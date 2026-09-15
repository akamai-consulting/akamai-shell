'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const apiRegistry = require('../src/api-registry');

test('discovers Crux through its documented service prefix', () => {
  const apiModule = apiRegistry.moduleFor('/crux/v1/mgmt-pop/apps');
  assert.equal(apiModule.name, 'Crux');
  assert.equal(apiModule.prefix, '/crux/v1');
  assert(apiModule.queryParameters.includes('accountSwitchKey'));
});

test('routes documented Crux methods and preserves request details', async () => {
  let request;
  const response = await apiRegistry.put(
    {},
    '/crux/v1/mgmt-pop/apps/app-1',
    { accountSwitchKey: 'switch-key' },
    { name: 'updated' },
    async (settings, path, query, body, method) => {
      request = { settings, path, query, body, method };
      return { statusCode: 202, body: { accepted: true } };
    }
  );

  assert.deepEqual(request, {
    settings: {},
    path: '/mgmt-pop/apps/app-1',
    query: { accountSwitchKey: 'switch-key' },
    body: { name: 'updated' },
    method: 'PUT'
  });
  assert.deepEqual(response, { statusCode: 202, body: { accepted: true } });
});

test('rejects methods not declared by the Crux OpenAPI document', () => {
  assert.throws(
    () => apiRegistry.put({}, '/crux/v1/mgmt-pop/agents', {}, {}),
    /No API module supports PUT path/
  );
  assert.throws(
    () => apiRegistry.post({}, '/crux/v1/mgmt-pop/agents/agent-1', {}, {}),
    /No API module supports POST path/
  );
});

test('completes Crux collection identifiers from the shared lookup path', async () => {
  let calls = 0;
  const [candidates, partial] = await apiRegistry.complete(
    '/crux/v1/mgmt-pop/agents/0',
    {},
    new Map(),
    async (settings, path, query) => {
      calls += 1;
      assert.deepEqual({ settings, path, query }, {
        settings: {},
        path: '/mgmt-pop/agents',
        query: {}
      });
      return {
        statusCode: 200,
        body: {
          objects: [
            { uuid_url: '0ghE7BU_Q9uSVR0ZPxP7Fg' },
            { uuid_url: 'other-agent' }
          ]
        }
      };
    }
  );

  assert.equal(partial, '/crux/v1/mgmt-pop/agents/0');
  assert.deepEqual(candidates, ['/crux/v1/mgmt-pop/agents/0ghE7BU_Q9uSVR0ZPxP7Fg']);
  assert.equal(calls, 1);
});
