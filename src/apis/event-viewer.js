'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/event-viewer-api/v1';
const CATALOG = loadOpenApiCatalog({ service: 'event-viewer/v1' });

module.exports = createApiModule({
  name: 'EventViewer',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: {
    GET: CATALOG.methodPaths.GET || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET'))
});
