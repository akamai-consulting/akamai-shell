'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/imaging/v2';
const CATALOG = loadOpenApiCatalog({ service: 'imaging/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

function collectionItems(body) {
  if (Array.isArray(body)) return body;
  return body && Array.isArray(body.items) ? body.items : [];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/imagecollections\/[^/]*$/,
    collection: '/imagecollections',
    prefix: '/imagecollections/',
    response: collectionItems,
    key: 'id'
  },
  {
    matches: /^\/policysets\/[^/]*$/,
    collection: '/policysets',
    prefix: '/policysets/',
    response: collectionItems,
    key: 'id'
  },
  {
    matches: /^\/network\/[^/]+\/policies\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: collectionItems,
    key: 'id'
  },
  {
    matches: /^\/network\/[^/]+\/images\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: collectionItems,
    key: 'id'
  }
];

function requestHeaders(settings) {
  const defaults = settings.parameterDefaults || {};
  const target = settings.target || settings;
  const contract = target.contractId || defaults.contractId || defaults.Contract;
  const policySet = settings.policySetId || defaults.policySetId || defaults['Policy-Set'];
  return {
    Accept: 'application/json',
    ...(contract ? { Contract: contract } : {}),
    ...(policySet ? { 'Policy-Set': policySet } : {})
  };
}

module.exports = createApiModule({
  name: 'Imaging',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS
    .filter((method) => method !== 'GET')
    .map((method) => [method, CATALOG.methodStaticPaths[method] || []])),
  dynamicCollections: DYNAMIC_COLLECTIONS,
  requestHeaders
});
