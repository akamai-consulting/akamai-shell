'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/reporting-api/v2';
const CATALOG = loadOpenApiCatalog({ service: 'reporting-api/v2' });
const SUPPORTED_METHODS = ['GET', 'POST'];

function reportItems(body) {
  return body && Array.isArray(body.reports) ? body.reports : [];
}

function linkParts(item) {
  if (!item || typeof item.reportLink !== 'string') return [];
  return item.reportLink.split('/').filter(Boolean);
}

function unique(items, key) {
  return [...new Map(items
    .filter((item) => item[key] !== undefined)
    .map((item) => [item[key], item])).values()];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/reports\/[^/]*$/,
    collection: '/reports',
    prefix: '/reports/',
    key: 'productFamily',
    response: (body) => unique(reportItems(body).map((item) => {
      const parts = linkParts(item);
      return { productFamily: parts[3] };
    }), 'productFamily')
  },
  {
    matches: /^\/reports\/[^/]+\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/`,
    key: 'reportingArea',
    response: (body) => unique(reportItems(body).map((item) => {
      const parts = linkParts(item);
      return { reportingArea: parts[4] };
    }), 'reportingArea')
  },
  {
    matches: /^\/reports\/[^/]+\/[^/]+\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'report',
    response: (body) => unique(reportItems(body).map((item) => {
      const parts = linkParts(item);
      return { report: parts[5] };
    }), 'report')
  }
];

module.exports = createApiModule({
  name: 'ReportingApiV2',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => SUPPORTED_METHODS.includes(method))
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
