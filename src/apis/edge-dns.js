'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/config-dns/v2';
const CATALOG = loadOpenApiCatalog({ service: 'config-dns/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const UNSUPPORTED_POST_PATHS = new Set([
  '/proxies/{proxyId}/zones/delete-requests',
  '/zones/delete-requests',
  '/zones/{zone}/versions/{uuid}/recordsets/activate'
]);

function staticPathsFor(endpoints) {
  const paths = new Set();
  for (const endpoint of endpoints) {
    const parts = endpoint.split('/').filter(Boolean);
    for (let length = 1; length <= parts.length; length += 1) {
      paths.add(`/${parts.slice(0, length).join('/')}`);
    }
  }
  return [...paths];
}

const METHOD_PATHS = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method,
  (CATALOG.methodPaths[method] || []).filter((endpoint) =>
    method !== 'POST' || !UNSUPPORTED_POST_PATHS.has(endpoint))
]));
const METHOD_STATIC_PATHS = Object.fromEntries(Object.entries(METHOD_PATHS)
  .filter(([method]) => method !== 'GET')
  .map(([method, endpoints]) => [method, staticPathsFor(endpoints)]));

function bodyRequired(method, apiPath) {
  return !(method === 'POST' && /^\/changelists\/[^/]+\/submit$/.test(apiPath));
}

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
  methodPaths: METHOD_PATHS,
  methodStaticPaths: METHOD_STATIC_PATHS,
  dynamicCollections: DYNAMIC_COLLECTIONS,
  combineStaticCandidates: true,
  bodyRequired
});
