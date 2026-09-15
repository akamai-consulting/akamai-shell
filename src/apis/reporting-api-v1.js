'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/reporting-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'reporting-api/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/reports\/[^/]*$/,
    collection: '/reports',
    prefix: '/reports/',
    key: 'name',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/reports\/[^/]+\/versions\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'version',
    response: (body) => Array.isArray(body) ? body : []
  }
];

module.exports = createApiModule({
  name: 'ReportingApiV1',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method === 'POST')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
