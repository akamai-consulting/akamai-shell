'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/identity-management/v3';
const CATALOG = loadOpenApiCatalog({ service: 'identity-management/v3' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

function arrayResponse(body) {
  return Array.isArray(body) ? body : [];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/api-clients\/[^/]*$/,
    collection: '/api-clients',
    prefix: '/api-clients/',
    response: arrayResponse,
    key: 'clientId'
  },
  {
    matches: /^\/api-clients\/self\/credentials\/[^/]*$/,
    collection: '/api-clients/self/credentials',
    prefix: '/api-clients/self/credentials/',
    response: arrayResponse,
    key: 'credentialId'
  },
  {
    matches: /^\/api-clients\/[^/]+\/credentials\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/`,
    response: arrayResponse,
    key: 'credentialId'
  },
  {
    matches: /^\/user-admin\/groups\/[^/]*$/,
    collection: '/user-admin/groups',
    prefix: '/user-admin/groups/',
    response: arrayResponse,
    key: 'groupId'
  },
  {
    matches: /^\/user-admin\/properties\/[^/]*$/,
    collection: '/user-admin/properties',
    prefix: '/user-admin/properties/',
    response: arrayResponse,
    key: 'assetId'
  },
  {
    matches: /^\/user-admin\/roles\/[^/]*$/,
    collection: '/user-admin/roles',
    prefix: '/user-admin/roles/',
    response: arrayResponse,
    key: 'roleId'
  },
  {
    matches: /^\/user-admin\/ui-identities\/[^/]*$/,
    collection: '/user-admin/ui-identities',
    prefix: '/user-admin/ui-identities/',
    response: arrayResponse,
    key: 'uiIdentityId'
  },
  {
    matches: /^\/users\/[^/]*$/,
    collection: '/users',
    prefix: '/users/',
    response: arrayResponse,
    key: 'uiUserName'
  }
];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

module.exports = createApiModule({
  name: 'IdentityManagement',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS
    .filter((method) => method !== 'GET')
    .map((method) => [method, CATALOG.methodStaticPaths[method] || []])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
