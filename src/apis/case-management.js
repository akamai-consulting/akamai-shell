'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/case-management/v3';
const CATALOG = loadOpenApiCatalog({ service: 'case-management/v3' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PATCH'];

function collectionItems(key) {
  return (body) => body && Array.isArray(body[key]) ? body[key] : [];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/cases\/[^/]*$/,
    collection: '/cases',
    prefix: '/cases/',
    response: collectionItems('cases'),
    key: 'caseId'
  },
  {
    matches: /^\/cases\/[^/]+\/attachments\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: collectionItems('attachments'),
    key: 'attachmentId'
  },
  {
    matches: /^\/categories\/[^/]*$/,
    collection: '/accounts-with-categories',
    prefix: '/categories/',
    response: (body) => (Array.isArray(body) ? body : [])
      .flatMap((account) => Array.isArray(account.categories) ? account.categories : []),
    key: 'categoryId'
  }
];

module.exports = createApiModule({
  name: 'CaseManagement',
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
