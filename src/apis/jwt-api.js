'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/jwt-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'jwt-api/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/key-collections\/[^/]*$/,
    collection: '/key-collections',
    prefix: '/key-collections/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'id'
  },
  {
    matches: /^\/key-collections\/[^/]+\/versions\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/versions/`,
    response: (body) => body && Array.isArray(body.versions) ? body.versions : [],
    key: 'id'
  }
];

module.exports = createApiModule({
  name: 'JwtApi',
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
