'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/etp-report/v3';
const CATALOG = loadOpenApiCatalog({ service: 'etp-report/v3' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/configs\/[^/]+\/schedules\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => Array.isArray(body) ? body : [],
    key: 'scheduleId'
  }
];

module.exports = createApiModule({
  name: 'EtpReport',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.methodStaticPaths.GET || [],
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => SUPPORTED_METHODS.includes(method) && method !== 'GET')
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
