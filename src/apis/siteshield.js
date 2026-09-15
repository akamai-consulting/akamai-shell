'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/siteshield/v1';
const CATALOG = loadOpenApiCatalog({ service: 'siteshield/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/maps\/[^/]*$/,
    collection: '/maps',
    prefix: '/maps/',
    response: (body) => body && Array.isArray(body.siteShieldMaps)
      ? body.siteShieldMaps : [],
    key: 'id'
  }
];

module.exports = createApiModule({
  name: 'SiteShield',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET')),
  dynamicCollections: DYNAMIC_COLLECTIONS,
  bodyRequired: { POST: false }
});
