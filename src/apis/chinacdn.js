'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/chinacdn/v1';
const CATALOG = loadOpenApiCatalog({ service: 'chinacdn/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/edge-hostnames\/[^/]*$/,
    collection: '/edge-hostnames',
    prefix: '/edge-hostnames/',
    response: (body) => body && Array.isArray(body.edgeHostnames) ? body.edgeHostnames : [],
    key: 'edgeHostname'
  },
  {
    matches: /^\/property-hostnames\/[^/]*$/,
    collection: '/property-hostnames',
    prefix: '/property-hostnames/',
    response: (body) => body && Array.isArray(body.propertyHostnames) ? body.propertyHostnames : [],
    key: 'hostname'
  },
  {
    matches: /^\/property-hostnames\/[^/]+\/provision-state-changes\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.provisionStateChanges)
      ? body.provisionStateChanges : [],
    key: 'id'
  }
];

module.exports = createApiModule({
  name: 'ChinaCDN',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: CATALOG.methodPaths,
  methodStaticPaths: CATALOG.methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS,
  combineStaticCandidates: true
});
