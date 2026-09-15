'use strict';

const { createApiModule } = require('../api-module');

const PREFIX = '/cloudlets/api/v2';
const STATIC_PATHS = [
  '/cloudlet-info', '/cloudlet-info/{cloudletId}',
  '/group-info', '/group-info/{groupId}',
  '/schemas', '/schemas/{schemaName}',
  '/policies', '/policies/{policyId}',
  '/policies/{policyId}/versions',
  '/policies/{policyId}/versions/{version}',
  '/policies/{policyId}/activations',
  '/policies/{policyId}/properties',
  '/properties',
  '/origins', '/origins/{originId}',
  '/origins/{originId}/versions',
  '/origins/{originId}/versions/{version}',
  '/origins/{originId}/activations',
  '/origins/{originId}/activations/{activationId}'
];
const QUERY_PARAMETERS = [
  'cloudletId', 'cloudletType', 'includeDeleted', 'includeRules', 'omitRules',
  'network', 'propertyName', 'offset', 'pageSize', 'async', 'index', 'type',
  'validate', 'version'
];
const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/cloudlet-info\/[^/]*$/,
    collection: '/cloudlet-info',
    prefix: '/cloudlet-info/',
    key: 'cloudletId',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/group-info\/[^/]*$/,
    collection: '/group-info',
    prefix: '/group-info/',
    key: 'groupId',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/policies\/[^/]*$/,
    collection: '/policies',
    prefix: '/policies/',
    key: 'policyId',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/origins\/[^/]*$/,
    collection: '/origins',
    prefix: '/origins/',
    key: 'originId',
    response: (body) => Array.isArray(body) ? body : []
  }
];

module.exports = createApiModule({
  name: 'CloudletsV2',
  prefix: PREFIX,
  queryParameters: QUERY_PARAMETERS,
  staticPaths: STATIC_PATHS,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
