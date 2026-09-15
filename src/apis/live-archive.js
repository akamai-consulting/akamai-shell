'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/live-archive/v1';
const CATALOG = loadOpenApiCatalog({ service: 'live-archive/v1' });
const SUPPORTED_METHODS = ['GET', 'POST'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const staticPaths = [...new Set(SUPPORTED_METHODS.flatMap((method) =>
  CATALOG.methodStaticPaths[method] || []))];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/streams\/[^/]+\/endpoints\/.*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.endpoints)
      ? body.endpoints.map((endpoint) => ({ endpoint }))
      : [],
    key: 'endpoint'
  }
];

module.exports = createApiModule({
  name: 'LiveArchive',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths,
  methodPaths,
  methodStaticPaths: {
    POST: CATALOG.methodStaticPaths.POST || []
  },
  dynamicCollections: DYNAMIC_COLLECTIONS
});
