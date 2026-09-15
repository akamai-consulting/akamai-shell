'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cloud-wrapper/v1';
const CATALOG = loadOpenApiCatalog({ service: 'cloud-wrapper/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/configurations\/[^/]*$/,
    collection: '/configurations',
    prefix: '/configurations/',
    key: 'id',
    response: (body) => body && Array.isArray(body.configurations) ? body.configurations : []
  },
  {
    matches: /^\/properties\/[^/]*$/,
    collection: '/properties',
    prefix: '/properties/',
    key: 'propertyId',
    response: (body) => body && Array.isArray(body.properties) ? body.properties : []
  },
  {
    matches: /^\/multi-cdn\/origin-hostnames\/[^/]*$/,
    collection: '/configurations',
    prefix: '/multi-cdn/origin-hostnames/',
    key: 'id',
    response: (body) => body && Array.isArray(body.configurations) ? body.configurations : []
  }
];

module.exports = createApiModule({
  name: 'CloudWrapper',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => ['POST', 'PUT'].includes(method))),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
