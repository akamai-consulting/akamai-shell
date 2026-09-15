'use strict';

const { createApiModule } = require('../api-module');

const PREFIX = '/cloudlets/v3';
const QUERY_PARAMETERS = [
  'cloudletId', 'cloudletType', 'includeDeleted', 'includeRules', 'omitRules',
  'network', 'propertyName', 'page', 'size'
];
const STATIC_PATHS = [
  '/cloudlet-info',
  '/policies',
  '/policies/{policyId}',
  '/policies/{policyId}/versions',
  '/policies/{policyId}/versions/{version}',
  '/policies/{policyId}/activations',
  '/policies/{policyId}/properties'
];
const DYNAMIC_COLLECTIONS = [
  {
    matches: (input) => /^\/policies\/[^/]*$/.test(input),
    collection: '/policies',
    prefix: '/policies/',
    key: 'policyId',
    response: (body) => body && Array.isArray(body.content) ? body.content : []
  },
  {
    matches: (input) => /^\/policies\/[^/]+\/versions\/[^/]*$/.test(input),
    collection: (input) => `${input.split('/').slice(0, 4).join('/')}`,
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'version',
    response: (body) => body && Array.isArray(body.content) ? body.content : []
  }
];

module.exports = createApiModule({
  name: 'Cloudlets',
  prefix: PREFIX,
  queryParameters: QUERY_PARAMETERS,
  staticPaths: STATIC_PATHS,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
