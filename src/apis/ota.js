'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/ota/v1';
const CATALOG = loadOpenApiCatalog({ service: 'ota/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/download-notifications\/[^/]*$/,
    collection: '/cpcodes',
    prefix: '/download-notifications/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'id'
  }
];

module.exports = createApiModule({
  name: 'OtaUpdates',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || []
  },
  dynamicCollections: DYNAMIC_COLLECTIONS
});
