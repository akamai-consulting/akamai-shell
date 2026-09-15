'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

// The OpenAPI server URL is /gtm-api/v1/reports/{...}; the hostname is
// supplied by the configured EdgeGrid credential.
const PREFIX = '/gtm-api/v1/reports';
const CATALOG = loadOpenApiCatalog({ service: 'gtm-api/v1' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/domain-list\/[^/]*$/,
    collection: '/domain-list',
    prefix: '/domain-list/',
    response: (body) => body && Array.isArray(body.domains)
      ? body.domains.map((domain) => ({ domain }))
      : [],
    key: 'domain'
  },
  {
    matches: /^\/domain-list\/[^/]+\/properties\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/properties/`,
    response: (body) => body && Array.isArray(body.properties)
      ? body.properties.map((property) => ({ property }))
      : [],
    key: 'property'
  },
  {
    matches: /^\/load-feedback\/domains\/[^/]+\/resources\/[^/]*$/,
    collection: (input) => `/domain-list/${input.split('/')[3]}`,
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/resources/`,
    response: (body) => body && Array.isArray(body.resources)
      ? body.resources.map((resource) => ({ resource }))
      : [],
    key: 'resource'
  }
];

module.exports = createApiModule({
  name: 'GtmApi',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: { GET: CATALOG.methodPaths.GET || [] },
  dynamicCollections: DYNAMIC_COLLECTIONS
});
