'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/eccu-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'eccu-api/v1' });
const SUPPORTED_METHODS = ['GET', 'POST'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/requests\/[^/]*$/,
    collection: '/requests',
    prefix: '/requests/',
    response: (body) => body && Array.isArray(body.requests) ? body.requests : [],
    key: 'requestId'
  }
];

module.exports = createApiModule({
  name: 'ECCU',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodStaticPaths[method] || []
  ])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
