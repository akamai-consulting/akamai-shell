'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/appsec/v1';
const CATALOG = loadOpenApiCatalog({ service: 'appsec/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));
const staticPaths = [...new Set(SUPPORTED_METHODS.flatMap((method) => methodPaths[method]))];
const methodStaticPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodStaticPaths[method] || []
]));

function collectionItems(keys) {
  return (body) => {
    for (const key of keys) {
      if (body && Array.isArray(body[key])) return body[key];
    }
    return [];
  };
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/configs\/[^/]*$/,
    collection: '/configs',
    prefix: '/configs/',
    response: collectionItems(['configurations']),
    key: 'id'
  },
  {
    matches: /^\/configs\/[^/]+\/versions\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: collectionItems(['versionList', 'versions']),
    key: 'version'
  },
  {
    matches: /^\/configs\/[^/]+\/versions\/[^/]+\/security-policies\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 6).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 6).join('/')}/`,
    response: collectionItems(['policies', 'securityPolicies']),
    key: 'policyId'
  },
  {
    matches: /^\/onboardings\/[^/]*$/,
    collection: '/onboardings',
    prefix: '/onboardings/',
    response: collectionItems(['onboardings']),
    key: 'onboardingId'
  },
  {
    matches: /^\/cves\/[^/]*$/,
    collection: '/cves',
    prefix: '/cves/',
    response: collectionItems(['cves']),
    key: 'cveId'
  }
];

module.exports = createApiModule({
  name: 'AppSec',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths,
  methodPaths,
  methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
