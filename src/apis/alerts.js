'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/alerts/v2';
const CATALOG = loadOpenApiCatalog({ service: 'alerts/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

function collectionItems(body) {
  return body && Array.isArray(body.data) ? body.data : [];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/alert-definitions\/[^/]*$/,
    collection: '/alert-definitions',
    prefix: '/alert-definitions/',
    response: collectionItems,
    key: 'definitionId'
  },
  {
    matches: /^\/alert-templates\/[^/]*$/,
    collection: '/alert-templates',
    prefix: '/alert-templates/',
    response: collectionItems,
    key: 'templateId'
  },
  {
    matches: /^\/alert-summaries\/[^/]*$/,
    collection: '/alert-summaries',
    prefix: '/alert-summaries/',
    response: collectionItems,
    key: 'definitionId'
  },
  {
    matches: /^\/alert-definitions\/[^/]+\/suppressions\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: collectionItems,
    key: 'suppressionId'
  }
];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS
  .filter((method) => method !== 'GET')
  .map((method) => [method, CATALOG.methodStaticPaths[method] || []]));

module.exports = createApiModule({
  name: 'Alerts',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
