'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/client-access-control/v1';
const CATALOG = loadOpenApiCatalog({ service: 'client-access-control/v1' });
const SUPPORTED_METHODS = ['GET', 'PUT'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/configurations\/[^/]*$/,
    collection: '/configurations',
    prefix: '/configurations/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'configurationId'
  },
  {
    matches: /^\/configurations\/[^/]+\/acknowledge\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/acknowledge/`,
    response: (body) => body && Array.isArray(body.proposedCidrs)
      ? body.proposedCidrs : [],
    key: 'version'
  }
];

module.exports = createApiModule({
  name: 'ClientAccessControl',
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
