'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/firewall-rules-manager/v1';
const CATALOG = loadOpenApiCatalog({ service: 'firewall-rules-manager/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/services\/[^/]*$/,
    collection: '/services',
    prefix: '/services/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'serviceId'
  }
];

module.exports = createApiModule({
  name: 'FirewallRulesManager',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method === 'PUT')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
