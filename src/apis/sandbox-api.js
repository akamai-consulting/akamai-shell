'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/sandbox-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'sandbox-api/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/sandboxes\/[^/]*$/,
    collection: '/sandboxes',
    prefix: '/sandboxes/',
    response: (body) => body && Array.isArray(body.sandboxes) ? body.sandboxes : [],
    key: 'sandboxId'
  },
  {
    matches: /^\/sandboxes\/[^/]+\/properties\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.properties) ? body.properties : [],
    key: 'sandboxPropertyId'
  }
];

module.exports = createApiModule({
  name: 'SandboxApi',
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
