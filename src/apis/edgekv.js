'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/edgekv/v1';
const CATALOG = loadOpenApiCatalog({ service: 'edgekv/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

function pathsFor(method) {
  return CATALOG.methodPaths[method].filter((path) =>
    SUPPORTED_METHODS.includes(method) && path);
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/auth\/groups\/[^/]*$/,
    collection: '/auth/groups',
    prefix: '/auth/groups/',
    response: (body) => body && Array.isArray(body.groups) ? body.groups : [],
    key: 'groupId'
  },
  {
    matches: /^\/networks\/[^/]+\/namespaces\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.namespaces) ? body.namespaces : [],
    key: 'namespace'
  },
  {
    matches: /^\/networks\/[^/]+\/namespaces\/[^/]+\/groups\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 6).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 6).join('/')}/`,
    response: (body) => body && Array.isArray(body) ? body.map((groupId) => ({ groupId })) : [],
    key: 'groupId'
  },
  {
    matches: /^\/networks\/[^/]+\/namespaces\/[^/]+\/groups\/[^/]+\/items\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 7).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 7).join('/')}/items/`,
    response: (body) => Array.isArray(body) ? body.map((itemId) => ({ itemId })) : [],
    key: 'itemId'
  },
  {
    matches: /^\/tokens\/[^/]*$/,
    collection: '/tokens',
    prefix: '/tokens/',
    response: (body) => body && Array.isArray(body.tokens) ? body.tokens : [],
    key: 'name'
  }
];

module.exports = createApiModule({
  name: 'EdgeKV',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, pathsFor(method)
  ])),
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => SUPPORTED_METHODS.includes(method) && method !== 'GET')
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
