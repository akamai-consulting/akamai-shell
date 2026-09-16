'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cloudlets/api/v2';
const CATALOG = loadOpenApiCatalog({ service: 'cloudlets/v2' });
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
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
