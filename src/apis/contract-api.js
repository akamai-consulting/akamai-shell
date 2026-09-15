'use strict';

const path = require('path');
const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/contract-api/v1';
const CATALOG = loadOpenApiCatalog({
  filePath: path.join(__dirname, 'contract-api-openapi.json')
});

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/contracts\/[^/]*$/,
    collection: '/contracts/identifiers',
    prefix: '/contracts/',
    response: (body) => Array.isArray(body)
      ? body.map((contractId) => ({ contractId }))
      : [],
    key: 'contractId'
  },
  {
    matches: /^\/reportingGroups\/[^/]*$/,
    collection: '/reportingGroups/identifiers',
    prefix: '/reportingGroups/',
    response: (body) => Array.isArray(body)
      ? body.map((reportingGroupId) => ({ reportingGroupId }))
      : [],
    key: 'reportingGroupId'
  }
];

module.exports = createApiModule({
  name: 'ContractAPI',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || []
  },
  dynamicCollections: DYNAMIC_COLLECTIONS
});
