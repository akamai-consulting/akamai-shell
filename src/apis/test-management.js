'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/test-management/v3';
const CATALOG = loadOpenApiCatalog({ service: 'test-management/v3' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/functional\/test-suites\/[^/]*$/,
    collection: '/functional/test-suites',
    prefix: '/functional/test-suites/',
    response: (body) => body && Array.isArray(body.testSuites) ? body.testSuites : [],
    key: 'testSuiteId'
  },
  {
    matches: (input) => /^\/functional\/test-suites\/[^/]+\/test-cases\/[^/]*$/.test(input),
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.testCases) ? body.testCases : [],
    key: 'testCaseId'
  },
  {
    matches: (input) => /^\/functional\/test-suites\/[^/]+\/variables\/[^/]*$/.test(input),
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.variables) ? body.variables : [],
    key: 'variableId'
  },
  {
    matches: /^\/test-runs\/[^/]*$/,
    collection: '/test-runs',
    prefix: '/test-runs/',
    response: (body) => body && Array.isArray(body.testRuns) ? body.testRuns : [],
    key: 'testRunId'
  }
];

module.exports = createApiModule({
  name: 'TestManagement',
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
