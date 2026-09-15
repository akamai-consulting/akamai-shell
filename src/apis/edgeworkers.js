'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/edgeworkers/v1';
const CATALOG = loadOpenApiCatalog({ service: 'edgeworkers/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: (input) => /^\/ids\/[^/]*$/.test(input),
    collection: '/ids',
    prefix: '/ids/',
    key: 'edgeWorkerId',
    response: (body) => body && Array.isArray(body.edgeWorkerIds) ? body.edgeWorkerIds : []
  },
  {
    matches: (input) => /^\/groups\/[^/]*$/.test(input),
    collection: '/groups',
    prefix: '/groups/',
    key: 'groupId',
    response: (body) => body && Array.isArray(body.groups) ? body.groups : []
  },
  {
    matches: (input) => /^\/reports\/[^/]*$/.test(input),
    collection: '/reports',
    prefix: '/reports/',
    key: 'reportId',
    response: (body) => body && Array.isArray(body.reports) ? body.reports : []
  },
  {
    matches: (input) => /^\/resource-tiers\/[^/]*$/.test(input),
    collection: '/resource-tiers',
    prefix: '/resource-tiers/',
    key: 'resourceTierId',
    response: (body) => body && Array.isArray(body.resourceTiers) ? body.resourceTiers : []
  },
  {
    matches: (input) => /^\/ids\/[^/]+\/versions\/[^/]*$/.test(input),
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'version',
    response: (body) => body && Array.isArray(body.versions) ? body.versions : []
  },
  {
    matches: (input) => /^\/ids\/[^/]+\/revisions\/[^/]*$/.test(input),
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'revisionId',
    response: (body) => body && Array.isArray(body.revisions) ? body.revisions : []
  },
  {
    matches: (input) => /^\/ids\/[^/]+\/activations\/[^/]*$/.test(input),
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'activationId',
    response: (body) => body && Array.isArray(body.activations) ? body.activations : []
  },
  {
    matches: (input) => /^\/ids\/[^/]+\/deactivations\/[^/]*$/.test(input),
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'deactivationId',
    response: (body) => body && Array.isArray(body.deactivations) ? body.deactivations : []
  }
];

module.exports = createApiModule({
  name: 'EdgeWorkers',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => ['GET', 'POST', 'PUT'].includes(method))),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
