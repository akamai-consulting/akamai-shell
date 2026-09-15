'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/identity-management/v2';
const CATALOG = loadOpenApiCatalog({ service: 'identity-management/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));
const staticPaths = [...new Set(SUPPORTED_METHODS.flatMap((method) =>
  methodStaticPaths[method]))];

const arrayResponse = (body) => Array.isArray(body) ? body : [];

const DYNAMIC_COLLECTIONS = [
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
    key: 'propertyId'
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
    matches: /^\/api-clients\/(?:self|[^/]+)\/credentials\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: arrayResponse,
    key: 'credentialId'
  }
];

module.exports = createApiModule({
  name: 'IdentityManagementV2',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths,
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
