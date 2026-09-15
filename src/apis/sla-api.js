'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/sla-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'sla-api/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/tests\/[^/]*$/,
    collection: '/tests',
    prefix: '/tests/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'slaTestId'
  }
];

module.exports = createApiModule({
  name: 'SlaApi',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: [...new Set(SUPPORTED_METHODS.flatMap((method) => methodStaticPaths[method]))],
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
