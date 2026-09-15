'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/config-dns/v2';
const CATALOG = loadOpenApiCatalog({ service: 'config-dns/v2' });
const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/zones\/[^/]*$/,
    collection: '/zones',
    prefix: '/zones/',
    response: (body) => body && Array.isArray(body.zones) ? body.zones : [],
    key: 'zone'
  },
  {
    matches: /^\/proxies\/[^/]*$/,
    collection: '/proxies',
    prefix: '/proxies/',
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'proxyId'
  },
  {
    matches: /^\/proxies\/[^/]+\/zones\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.proxyZones) ? body.proxyZones : [],
    key: 'name'
  }
];

module.exports = createApiModule({
  name: 'EdgeDns',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: { GET: CATALOG.methodPaths.GET || [] },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET')),
  dynamicCollections: DYNAMIC_COLLECTIONS,
  combineStaticCandidates: true
});
