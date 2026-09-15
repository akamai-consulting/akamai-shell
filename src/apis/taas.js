'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/taas/v2';
const CATALOG = loadOpenApiCatalog({ service: 'taas/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/revocation-lists\/[^/]*$/,
    collection: '/revocation-lists',
    prefix: '/revocation-lists/',
    key: 'id',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/revocation-lists\/[^/]+\/identifiers\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'id',
    response: (body) => Array.isArray(body) ? body : []
  }
];

module.exports = createApiModule({
  name: 'TaaS',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => SUPPORTED_METHODS.includes(method) && method !== 'GET')
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
