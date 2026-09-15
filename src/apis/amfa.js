'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/amfa/v1';
const CATALOG = loadOpenApiCatalog({ service: 'amfa/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

function collectionItems(key) {
  return (body) => (body && Array.isArray(body[key]) ? body[key] : []);
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/groups\/[^/]*$/,
    collection: '/groups',
    prefix: '/groups/',
    response: collectionItems('page'),
    key: 'groupId'
  },
  {
    matches: /^\/users\/[^/]*$/,
    collection: '/users',
    prefix: '/users/',
    response: collectionItems('users'),
    key: 'userId'
  },
  {
    matches: /^\/users\/[^/]+\/aliases\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/aliases/`,
    response: collectionItems('aliases'),
    key: 'aliasId'
  },
  {
    matches: /^\/users\/[^/]+\/bypass-codes\/[^/]*$/,
    collection: (input) => `${input.split('/').slice(0, 3).join('/')}/bypass-codes`,
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/bypass-codes/`,
    response: collectionItems('bypassCodes'),
    key: 'bypassCodeId'
  },
  {
    matches: /^\/users\/[^/]+\/devices\/[^/]*$/,
    collection: (input) => `${input.split('/').slice(0, 3).join('/')}/devices`,
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/devices/`,
    response: collectionItems('devices'),
    key: 'deviceId'
  }
];

module.exports = createApiModule({
  name: 'AkamaiMFA',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: [...new Set(SUPPORTED_METHODS.flatMap((method) => methodStaticPaths[method]))],
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
