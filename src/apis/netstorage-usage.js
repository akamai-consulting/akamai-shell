'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

// The Usage API is host-rooted in the OpenAPI document.  The shell keeps the
// versioned service namespace so it can be addressed independently of other
// root-level APIs; requests are still sent to the host root by the transport.
const PREFIX = '/netstorage-usage/v1';
const CATALOG = loadOpenApiCatalog({ service: 'netstorage-usage-api' });
const SUPPORTED_METHODS = ['GET', 'PUT', 'DELETE'];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/[^/]+\/[^/]*$/,
    collection: (input) => `/${input.split('/')[1]}`,
    prefix: (input) => `/${input.split('/')[1]}/`,
    response: (body) => Array.isArray(body) ? body : [],
    key: 'subscriptionName'
  }
];

module.exports = createApiModule({
  name: 'NetStorageUsage',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: [...new Set(SUPPORTED_METHODS.flatMap((method) => methodPaths[method]))],
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodStaticPaths[method] || []
  ])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
