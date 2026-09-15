'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/siem/v1';
const CATALOG = loadOpenApiCatalog({ service: 'siem/v1' });

module.exports = createApiModule({
  name: 'SIEM',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || []
  }
});
