'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cloudlets/api/v2';
const CATALOG = loadOpenApiCatalog({ service: 'cloudlets/v2' });
const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/cloudlet-info\/[^/]*$/,
    collection: '/cloudlet-info',
    prefix: '/cloudlet-info/',
    key: 'cloudletId',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/group-info\/[^/]*$/,
    collection: '/group-info',
    prefix: '/group-info/',
    key: 'groupId',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/policies\/[^/]*$/,
    collection: '/policies',
    prefix: '/policies/',
    key: 'policyId',
    response: (body) => Array.isArray(body) ? body : []
  },
  {
    matches: /^\/origins\/[^/]*$/,
    collection: '/origins',
    prefix: '/origins/',
    key: 'originId',
    response: (body) => Array.isArray(body) ? body : []
  }
];

const CloudletsV2 = createApiModule({
  name: 'CloudletsV2',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});

CloudletsV2.filterParameterHelp = (method, apiPath, parameters) => {
  if (method.toUpperCase() !== 'POST' ||
      !/^\/cloudlets\/api\/v2\/policies\/[^/]+\/versions$/.test(apiPath)) {
    return parameters;
  }
  return parameters.filter((parameter) =>
    parameter.in !== 'path' && parameter.name !== 'matchRulesFormat');
};

module.exports = CloudletsV2;
