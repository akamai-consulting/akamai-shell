'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/network-cloud-firewall/v1';
const CATALOG = loadOpenApiCatalog({ service: 'network-cloud-firewall/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/acls\/aliases\/[^/]*$/,
    collection: '/acls/aliases',
    prefix: '/acls/aliases/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'aliasId'
  },
  {
    matches: /^\/acls\/versions\/[^/]*$/,
    collection: '/acls/versions',
    prefix: '/acls/versions/',
    response: (body) => body && Array.isArray(body.content) ? body.content : [],
    key: 'version'
  },
  {
    matches: /^\/rule-hits\/rules\/[^/]*$/,
    collection: '/rule-hits/rules',
    prefix: '/rule-hits/rules/',
    response: (body) => body && Array.isArray(body.rules) ? body.rules : [],
    key: 'ruleId'
  }
];

module.exports = createApiModule({
  name: 'NetworkCloudFirewall',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: methodStaticPaths.GET || [],
  methodPaths,
  methodStaticPaths: Object.fromEntries(
    Object.entries(methodStaticPaths).filter(([method]) => method !== 'GET')
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
