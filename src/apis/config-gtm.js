'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/config-gtm/v1';
const CATALOG = loadOpenApiCatalog({ service: 'config-gtm/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/domains\/[^/]*$/,
    collection: '/domains',
    prefix: '/domains/',
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'name'
  },
  {
    matches: /^\/domains\/[^/]+\/properties\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'name'
  },
  {
    matches: /^\/domains\/[^/]+\/resources\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'name'
  },
  {
    matches: /^\/domains\/[^/]+\/datacenters\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'datacenterId'
  },
  {
    matches: /^\/domains\/[^/]+\/as-maps\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'name'
  },
  {
    matches: /^\/domains\/[^/]+\/cidr-maps\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'name'
  },
  {
    matches: /^\/domains\/[^/]+\/geographic-maps\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'name'
  }
];

module.exports = createApiModule({
  name: 'ConfigGtm',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => method === 'POST' || method === 'PUT')
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
