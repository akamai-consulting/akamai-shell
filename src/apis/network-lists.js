'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/network-list/v2';
const CATALOG = loadOpenApiCatalog({ service: 'network-lists/v2' });
const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/network-lists\/[^/]*$/,
    collection: '/network-lists',
    prefix: '/network-lists/',
    key: 'uniqueId',
    response: (body) => body && Array.isArray(body.networkLists)
      ? body.networkLists
      : []
  }
];

module.exports = createApiModule({
  name: 'NetworkLists',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method === 'POST' || method === 'PUT')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
