'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/prolexic-network-health/v1';
const CATALOG = loadOpenApiCatalog({ service: 'prolexic-network-health/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/targets\/[^/]*$/,
    collection: '/targets',
    prefix: '/targets/',
    response: (body) => body && Array.isArray(body.targets) ? body.targets : [],
    key: 'targetId'
  }
];

module.exports = createApiModule({
  name: 'ProlexicNetworkHealth',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
