'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/adaptive-acceleration/v1';
const CATALOG = loadOpenApiCatalog({ service: 'adaptive-acceleration/v1' });

module.exports = createApiModule({
  name: 'AdaptiveAcceleration',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || []
  },
  methodStaticPaths: {
    POST: CATALOG.methodStaticPaths.POST || []
  }
});
