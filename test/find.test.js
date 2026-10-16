'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseMatchRule, matchesRule, findResources } = require('../src/find');

test('parses find query match forms', () => {
  assert.deepEqual(parseMatchRule('propertyName=tai-log-00'), {
    field: 'propertyName', fieldSubstring: false, value: 'tai-log-00', valueSubstring: false
  });
  assert.deepEqual(parseMatchRule('propertyName=~tai-log'), {
    field: 'propertyName', fieldSubstring: false, value: 'tai-log', valueSubstring: true
  });
  assert.deepEqual(parseMatchRule('~name=~log'), {
    field: 'name', fieldSubstring: true, value: 'log', valueSubstring: true
  });
  assert.deepEqual(parseMatchRule('~=~log'), {
    field: '', fieldSubstring: true, value: 'log', valueSubstring: true
  });
  assert.deepEqual(parseMatchRule('~name=log'), {
    field: 'name', fieldSubstring: true, value: 'log', valueSubstring: false
  });
  assert.deepEqual(parseMatchRule('~=tai-ionp-00'), {
    field: '', fieldSubstring: true, value: 'tai-ionp-00', valueSubstring: false
  });
});

test('matches exact and substring field/value criteria', () => {
  const resource = { propertyName: 'tai-log-00', metadata: { owner: 'tai' } };
  assert.equal(matchesRule(resource, parseMatchRule('propertyName=tai-log-00')), true);
  assert.equal(matchesRule(resource, parseMatchRule('propertyName=~log')), true);
  assert.equal(matchesRule(resource, parseMatchRule('~Name=~LOG')), false);
  assert.equal(matchesRule(resource, parseMatchRule('~=~tai')), true);
  assert.equal(matchesRule(resource, parseMatchRule('~Name=tai-log-00')), true);
  assert.equal(matchesRule(resource, parseMatchRule('~=tai-log-00')), true);
  assert.equal(matchesRule(resource, parseMatchRule('~=tai-log')), false);
});

test('scans one property collection response without fetching details', async () => {
  const calls = [];
  const results = await findResources(
    { parameterDefaults: {}, contractId: 'ctr_1', groupId: 'grp_1' },
    '/papi/v1/properties',
    'propertyName=target',
    async (settings, requestPath) => {
      calls.push(requestPath);
      return { statusCode: 200, headers: {}, body: {
        properties: { items: [
          { propertyId: 'prp_1', propertyName: 'other' },
          { propertyId: 'prp_2', propertyName: 'target' }
        ] }
      } };
    }
  );

  assert.deepEqual(results, [{
    path: '/papi/v1/properties/prp_2',
    resource: { propertyId: 'prp_2', propertyName: 'target' }
  }]);
  assert.deepEqual(calls, ['/properties']);
});
