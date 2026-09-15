'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/apikey-manager-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'apikey-manager-api/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/collections\/\d*$/,
    collection: '/collections',
    prefix: '/collections/',
    key: 'id',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/counters\/\d*$/,
    collection: '/counters',
    prefix: '/counters/',
    key: 'id',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/keys\/\d*$/,
    collection: '/keys',
    prefix: '/keys/',
    key: 'id',
    response: (body) => {
      if (Array.isArray(body)) return body;
      if (body && Array.isArray(body.keys)) return body.keys.map((id) => ({ id }));
      if (body && Array.isArray(body.items)) return body.items;
      return [];
    }
  }
];

module.exports = createApiModule({
  name: 'ApiKeyManager',
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
