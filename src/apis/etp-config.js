'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/etp-config/v3';
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const CATALOG = loadOpenApiCatalog({ service: 'etp-config/v3' });

function arrayResponse(body) {
  return Array.isArray(body) ? body : [];
}

function nestedCollection(input, length) {
  return input.split('/').slice(0, length).join('/');
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/configs\/[^/]*$/,
    collection: '/configs/all',
    prefix: '/configs/',
    response: arrayResponse,
    key: 'id'
  },
  {
    matches: /^\/customers\/[^/]*$/,
    collection: '/configs/all',
    prefix: '/customers/',
    response: arrayResponse,
    key: 'id'
  },
  {
    matches: /^\/configs\/[^/]+\/(policies|sites|deployments|dictionaries|lists|patterns|honeypots|akamai-sinkholes|tenants|proxy-credentials|vpn-credentials|client-versions)\/[^/]*$/,
    collection: (input) => nestedCollection(input, 4),
    prefix: (input) => `${nestedCollection(input, 4)}/`,
    response: arrayResponse,
    key: 'id'
  },
  {
    matches: /^\/configs\/[^/]+\/sites\/[^/]+\/sub-locations\/[^/]*$/,
    collection: (input) => nestedCollection(input, 6),
    prefix: (input) => `${nestedCollection(input, 6)}/`,
    response: arrayResponse,
    key: 'id'
  },
  {
    matches: /^\/customers\/[^/]+\/certificates\/[^/]*$/,
    collection: (input) => nestedCollection(input, 3),
    prefix: (input) => `${nestedCollection(input, 3)}/`,
    response: arrayResponse,
    key: 'certificateId'
  }
];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method,
  CATALOG.methodPaths[method] || []
]));

module.exports = createApiModule({
  name: 'EtpConfig',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS
    .filter((method) => method !== 'GET')
    .map((method) => [method, CATALOG.methodStaticPaths[method] || []])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
