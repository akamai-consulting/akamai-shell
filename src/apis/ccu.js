'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/ccu/v3';
const CATALOG = loadOpenApiCatalog({ service: 'ccu/v3' });

module.exports = createApiModule({
  name: 'ContentControlUtility',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    POST: CATALOG.methodPaths.POST || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET'))
});
