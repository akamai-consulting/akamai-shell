'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/events/v3';
const CATALOG = loadOpenApiCatalog({ service: 'events/v3' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/events\/[^/]*$/,
    collection: '/events',
    prefix: '/events/',
    response: (body) => body && Array.isArray(body.data) ? body.data : [],
    key: 'id'
  }
];

const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method,
  CATALOG.methodPaths[method] || []
]));

module.exports = createApiModule({
  name: 'Events',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS
    .filter((method) => method !== 'GET')
    .map((method) => [method, CATALOG.methodStaticPaths[method] || []])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
