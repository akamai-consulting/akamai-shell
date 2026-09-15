'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cam/v1';
const CATALOG = loadOpenApiCatalog({ service: 'cam/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/access-keys\/[^/]*$/,
    collection: '/access-keys',
    prefix: '/access-keys/',
    response: (body) => body && Array.isArray(body.accessKeys) ? body.accessKeys : [],
    key: 'accessKeyUid'
  },
  {
    matches: /^\/access-keys\/[^/]+\/versions\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.accessKeyVersions)
      ? body.accessKeyVersions : [],
    key: 'version'
  }
];

module.exports = createApiModule({
  name: 'CloudAccessManager',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodStaticPaths[method] || []
  ])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
