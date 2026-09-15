'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cloudlets/v3';
const CATALOG = loadOpenApiCatalog({ service: 'cloudlets/v3' });
const DYNAMIC_COLLECTIONS = [
  {
    matches: (input) => /^\/policies\/[^/]*$/.test(input),
    collection: '/policies',
    prefix: '/policies/',
    key: 'policyId',
    response: (body) => body && Array.isArray(body.content) ? body.content : []
  },
  {
    matches: (input) => /^\/policies\/[^/]+\/versions\/[^/]*$/.test(input),
    collection: (input) => `${input.split('/').slice(0, 4).join('/')}`,
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'version',
    response: (body) => body && Array.isArray(body.content) ? body.content : []
  }
];

module.exports = createApiModule({
  name: 'Cloudlets',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: { GET: CATALOG.methodPaths.GET || [] },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
