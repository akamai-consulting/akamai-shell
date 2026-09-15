'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/api-definitions/v2';
const CATALOG = loadOpenApiCatalog({ service: 'api-definitions/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

function collectionItems(keys) {
  return (body) => {
    for (const key of keys) {
      if (body && Array.isArray(body[key])) return body[key];
    }
    return [];
  };
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/categories\/[^/]*$/,
    collection: '/categories',
    prefix: '/categories/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'apiCategoryId'
  },
  {
    matches: /^\/endpoints\/[^/]*$/,
    collection: '/endpoints',
    prefix: '/endpoints/',
    response: collectionItems(['apiEndPoints']),
    key: 'apiEndPointId'
  },
  {
    matches: /^\/endpoints\/[^/]+\/versions\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: collectionItems(['apiVersions']),
    key: 'versionNumber'
  },
  {
    matches: /^\/endpoints\/[^/]+\/versions\/[^/]+\/piis\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 6).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 6).join('/')}/`,
    response: collectionItems(['piis']),
    key: 'id'
  },
  {
    matches: /^\/endpoints\/[^/]+\/versions\/[^/]+\/resources\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 6).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 6).join('/')}/`,
    response: (body) => Array.isArray(body) ? body : [],
    key: 'apiResourceId'
  }
];

module.exports = createApiModule({
  name: 'ApiDefinitions',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: [...new Set(SUPPORTED_METHODS.flatMap((method) => methodPaths[method]))],
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodStaticPaths[method] || []
  ])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
