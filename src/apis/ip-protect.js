'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/ip-protect/v1';
const CATALOG = loadOpenApiCatalog({ service: 'ip-protect/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/policy-domains\/[^/]*$/,
    collection: '/policy-domains',
    prefix: '/policy-domains/',
    response: (body) => Array.isArray(body)
      ? body.map((name) => ({ name }))
      : [],
    key: 'name'
  }
];

module.exports = createApiModule({
  name: 'IpProtect',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: methodStaticPaths.GET,
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
