'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cprg/v1';
const CATALOG = loadOpenApiCatalog({ service: 'cprg/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/cpcodes\/[^/]*$/,
    collection: '/cpcodes',
    prefix: '/cpcodes/',
    response: (body) => body && Array.isArray(body.cpcodes) ? body.cpcodes : [],
    key: 'cpcodeId'
  },
  {
    matches: /^\/reporting-groups\/[^/]*$/,
    collection: '/reporting-groups',
    prefix: '/reporting-groups/',
    response: (body) => body && Array.isArray(body.groups) ? body.groups : [],
    key: 'reportingGroupId'
  },
  {
    matches: /^\/reporting-groups\/[^/]+\/products\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/products/`,
    response: (body) => body && Array.isArray(body.products) ? body.products : [],
    key: 'productId'
  }
];

module.exports = createApiModule({
  name: 'CPResourceGroups',
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
