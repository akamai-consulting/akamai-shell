'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/script-management/v1';
const CATALOG = loadOpenApiCatalog({ service: 'script-management' });
const SUPPORTED_METHODS = ['GET', 'POST'];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

module.exports = createApiModule({
  name: 'ScriptManagement',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths,
  methodStaticPaths
});
