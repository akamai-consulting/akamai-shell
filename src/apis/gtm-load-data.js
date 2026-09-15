'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/gtm-load-data/v1';
const CATALOG = loadOpenApiCatalog({ service: 'gtm-load-data/v1' });

module.exports = createApiModule({
  name: 'GTM Load Data',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET'))
});
