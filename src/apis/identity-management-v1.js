'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/identity-management/v1';
const CATALOG = loadOpenApiCatalog({ service: 'identity-management/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/open-identities\/[^/]+\/credentials\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.slice(0, input.lastIndexOf('/') + 1)}`,
    key: 'credentialId',
    response: (body) => Array.isArray(body) ? body : []
  }
];

module.exports = createApiModule({
  name: 'IdentityManagementV1',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: CATALOG.methodPaths,
  methodStaticPaths: CATALOG.methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
