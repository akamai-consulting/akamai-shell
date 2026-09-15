'use strict';

const path = require('path');
const { loadOpenApiCatalog } = require('./openapi-catalog');
const {
  staticCandidates,
  dynamicCollectionFor,
  dynamicCandidates: completeDynamicCandidates
} = require('./path-completion');

const OPENAPI_CATALOG = loadOpenApiCatalog({ service: 'papi/v1' });
const STATIC_PATHS = OPENAPI_CATALOG.staticPaths.slice().sort((left, right) => {
  const leftVersions = left.startsWith('/properties/{propertyId}/versions');
  const rightVersions = right.startsWith('/properties/{propertyId}/versions');
  return Number(rightVersions) - Number(leftVersions);
});
const DYNAMIC_COLLECTIONS = [
  {
    matches: (input) => /^\/edgehostnames\/[^/]*$/.test(input),
    prefix: () => '/edgehostnames/',
    collection: '/edgehostnames',
    response: (body) => body && body.edgeHostnames && body.edgeHostnames.items,
    key: 'edgeHostnameId'
  },
  {
    matches: (input) => /^\/cpcodes\/[^/]*$/.test(input),
    prefix: () => '/cpcodes/',
    collection: '/cpcodes',
    response: (body) => body && body.cpcodes && body.cpcodes.items,
    key: 'cpcodeId'
  },
  {
    matches: (input) => /^\/properties\/[^/]+\/versions\/[^/]*$/.test(input),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    response: (body) => body && body.versions && body.versions.items,
    key: 'propertyVersion'
  },
  {
    matches: (input) => /^\/properties\/[^/]+\/activations\/[^/]*$/.test(input),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/activations/`,
    collection: (input) => input.split('/').slice(0, 3).join('/') + '/activations',
    response: (body) => body && body.activations && body.activations.items,
    key: 'activationId'
  },
  {
    matches: (input) => /^\/properties\/[^/]+\/hostname-activations\/[^/]*$/.test(input),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/hostname-activations/`,
    collection: (input) => input.split('/').slice(0, 3).join('/') + '/hostname-activations',
    response: (body) => body && body.hostnameActivations && body.hostnameActivations.items,
    key: 'hostnameActivationId'
  },
  {
    matches: (input) => /^\/includes\/[^/]+\/versions\/[^/]*$/.test(input),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    response: (body) => body && body.versions && body.versions.items,
    key: 'includeVersion'
  },
  {
    matches: (input) => /^\/includes\/[^/]*$/.test(input),
    prefix: () => '/includes/',
    collection: '/includes',
    response: (body) => body && body.includes && body.includes.items,
    key: 'includeId'
  },
  {
    matches: (input) => /^\/custom-behaviors\/[^/]*$/.test(input),
    prefix: () => '/custom-behaviors/',
    collection: '/custom-behaviors',
    response: (body) => body && body.customBehaviors && body.customBehaviors.items,
    key: 'behaviorId'
  },
  {
    matches: (input) => /^\/custom-overrides\/[^/]*$/.test(input),
    prefix: () => '/custom-overrides/',
    collection: '/custom-overrides',
    response: (body) => body && body.customOverrides && body.customOverrides.items,
    key: 'overrideId'
  },
  {
    matches: (input) => /^\/properties\/[^/]*$/.test(input),
    prefix: () => '/properties/',
    collection: '/properties',
    response: (body) => body && body.properties && body.properties.items,
    key: 'propertyId'
  },
  {
    matches: (input) => /^\/hostnames\/[^/]*$/.test(input),
    prefix: () => '/hostnames/',
    collection: '/hostnames',
    response: (body) => body && body.hostnames && body.hostnames.items,
    key: 'cnameFrom'
  },
  {
    matches: (input) => /^\/products\/[^/]*$/.test(input),
    prefix: () => '/products/',
    collection: '/products',
    response: (body) => body && body.products && body.products.items,
    key: 'productId'
  }
];

function pathCandidates(input) {
  return staticCandidates(input, STATIC_PATHS);
}

function collectionFor(input) {
  return dynamicCollectionFor(input, DYNAMIC_COLLECTIONS);
}

function dynamicCandidates(input, body) {
  return completeDynamicCandidates(input, body, collectionFor(input));
}

function referenceRoot() {
  return path.resolve(__dirname, '../ref/akamai-apis/apis/papi/v1');
}

module.exports = {
  pathCandidates,
  collectionFor,
  dynamicCandidates,
  referenceRoot,
  staticPaths: STATIC_PATHS,
  methodPaths: OPENAPI_CATALOG.methodPaths,
  methodStaticPaths: OPENAPI_CATALOG.methodStaticPaths,
  queryParameters: OPENAPI_CATALOG.queryParameters,
  openApiCatalog: OPENAPI_CATALOG,
  dynamicCollections: DYNAMIC_COLLECTIONS
};
