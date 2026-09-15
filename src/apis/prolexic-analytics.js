'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/prolexic-analytics/v2';
const CATALOG = loadOpenApiCatalog({ service: 'prolexic-analytics/v2' });
const METHODS = ['GET', 'POST'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: (input) => /^\/(?:attack-report|attack-reports|critical-events|events)\/contract\/[^/]*$/.test(input) ||
      /^\/metric-types\/[^/]*$/.test(input),
    collection: '/customer/names',
    prefix: (input) => input.startsWith('/metric-types/')
      ? '/metric-types/'
      : `${input.split('/').slice(0, 3).join('/')}/`,
    response: (body) => body && Array.isArray(body.customerNames) ? body.customerNames : [],
    key: 'contractId'
  }
];

module.exports = createApiModule({
  name: 'ProlexicAnalytics',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: Object.fromEntries(METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => METHODS.includes(method))
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
