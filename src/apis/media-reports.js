'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/media-reports/v1';
const CATALOG = loadOpenApiCatalog({ service: 'media-reports/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/media-services-live\/http-ingest\/data-stores\/[^/]*$/,
    collection: '/media-services-live/http-ingest/data-stores',
    prefix: '/media-services-live/http-ingest/data-stores/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'id'
  },
  {
    matches: /^\/media-services-live\/http-ingest\/origin-shield\/data-stores\/[^/]*$/,
    collection: '/media-services-live/http-ingest/origin-shield/data-stores',
    prefix: '/media-services-live/http-ingest/origin-shield/data-stores/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'id'
  }
];

module.exports = createApiModule({
  name: 'MediaReports',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: { GET: CATALOG.methodPaths.GET || [] },
  dynamicCollections: DYNAMIC_COLLECTIONS
});
