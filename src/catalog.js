'use strict';

const path = require('path');
const {
  staticCandidates,
  dynamicCollectionFor,
  dynamicCandidates: completeDynamicCandidates
} = require('./path-completion');

const STATIC_PATHS = [
  '/build',
  '/groups',
  '/contracts',
  '/products',
  '/products/{productId}/mapping-use-cases',
  '/cpcodes',
  '/cpcodes/',
  '/cpcodes/{cpcodeId}',
  '/edgehostnames',
  '/edgehostnames/',
  '/edgehostnames/{edgeHostnameId}',
  '/hostnames',
  '/hostnames/{hostname}/audit-history',
  '/includes',
  '/includes/{includeId}',
  '/includes/{includeId}/activations',
  '/includes/{includeId}/activations/{activationId}',
  '/includes/{includeId}/parents',
  '/includes/{includeId}/versions',
  '/includes/{includeId}/versions/latest',
  '/includes/{includeId}/versions/{includeVersion}',
  '/includes/{includeId}/versions/{includeVersion}/available-behaviors',
  '/includes/{includeId}/versions/{includeVersion}/available-criteria',
  '/includes/{includeId}/versions/{includeVersion}/rules',
  '/includes/validation-results/{activationId}/properties/{propertyId}/versions/{propertyVersion}',
  '/custom-behaviors',
  '/custom-behaviors/{behaviorId}',
  '/custom-overrides',
  '/custom-overrides/{overrideId}',
  '/client-settings',
  '/rule-formats',
  '/schemas/products/{productId}/{ruleFormat}',
  '/schemas/request/{filename}',
  '/bulk/activations',
  '/bulk/activations/{bulkActivationId}',
  '/bulk/property-version-creations',
  '/bulk/property-version-creations/{bulkCreateId}',
  '/bulk/rules-patch-requests',
  '/bulk/rules-patch-requests/{bulkPatchId}',
  '/bulk/rules-search-requests',
  '/bulk/rules-search-requests-synch',
  '/bulk/rules-search-requests/{bulkSearchId}',
  '/search/find-by-value',
  '/properties',
  '/properties/',
  '/properties/{propertyId}',
  '/properties/{propertyId}/versions',
  '/properties/{propertyId}/versions/',
  '/properties/{propertyId}/versions/latest',
  '/properties/{propertyId}/versions/{propertyVersion}',
  '/properties/{propertyId}/activations',
  '/properties/{propertyId}/activations/{activationId}',
  '/properties/{propertyId}/hostname-activations',
  '/properties/{propertyId}/hostname-activations/{hostnameActivationId}',
  '/properties/{propertyId}/hostnames',
  '/properties/{propertyId}/hostnames/diff',
  '/properties/{propertyId}/versions/{propertyVersion}/available-behaviors',
  '/properties/{propertyId}/versions/{propertyVersion}/available-criteria',
  '/properties/{propertyId}/versions/{propertyVersion}/hostnames',
  '/properties/{propertyId}/versions/{propertyVersion}/includes',
  '/properties/{propertyId}/versions/{propertyVersion}/rules'
];

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
  dynamicCollections: DYNAMIC_COLLECTIONS
};
