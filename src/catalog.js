'use strict';

const path = require('path');

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
    pathPrefix: () => '/edgehostnames/',
    collection: '/edgehostnames',
    responseKey: 'edgeHostnames',
    key: 'edgeHostnameId'
  },
  {
    matches: (input) => /^\/cpcodes\/[^/]*$/.test(input),
    pathPrefix: () => '/cpcodes/',
    collection: '/cpcodes',
    responseKey: 'cpcodes',
    key: 'cpcodeId'
  },
  {
    matches: (input) => /^\/properties\/[^/]+\/versions\/[^/]*$/.test(input),
    pathPrefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    responseKey: 'versions',
    key: 'propertyVersion'
  },
  {
    matches: (input) => /^\/properties\/[^/]+\/activations\/[^/]*$/.test(input),
    pathPrefix: (input) => `${input.split('/').slice(0, 3).join('/')}/activations/`,
    collection: (input) => input.split('/').slice(0, 3).join('/') + '/activations',
    responseKey: 'activations',
    key: 'activationId'
  },
  {
    matches: (input) => /^\/properties\/[^/]+\/hostname-activations\/[^/]*$/.test(input),
    pathPrefix: (input) => `${input.split('/').slice(0, 3).join('/')}/hostname-activations/`,
    collection: (input) => input.split('/').slice(0, 3).join('/') + '/hostname-activations',
    responseKey: 'hostnameActivations',
    key: 'hostnameActivationId'
  },
  {
    matches: (input) => /^\/includes\/[^/]+\/versions\/[^/]*$/.test(input),
    pathPrefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    responseKey: 'versions',
    key: 'includeVersion'
  },
  {
    matches: (input) => /^\/includes\/[^/]*$/.test(input),
    pathPrefix: () => '/includes/',
    collection: '/includes',
    responseKey: 'includes',
    key: 'includeId'
  },
  {
    matches: (input) => /^\/custom-behaviors\/[^/]*$/.test(input),
    pathPrefix: () => '/custom-behaviors/',
    collection: '/custom-behaviors',
    responseKey: 'customBehaviors',
    key: 'behaviorId'
  },
  {
    matches: (input) => /^\/custom-overrides\/[^/]*$/.test(input),
    pathPrefix: () => '/custom-overrides/',
    collection: '/custom-overrides',
    responseKey: 'customOverrides',
    key: 'overrideId'
  },
  {
    matches: (input) => /^\/properties\/[^/]*$/.test(input),
    pathPrefix: () => '/properties/',
    collection: '/properties',
    responseKey: 'properties',
    key: 'propertyId'
  },
  {
    matches: (input) => /^\/products\/[^/]*$/.test(input),
    pathPrefix: () => '/products/',
    collection: '/products',
    responseKey: 'products',
    key: 'productId'
  }
];

function pathCandidates(input) {
  const prefix = input || '/';
  const candidates = new Set();
  const inputParts = prefix.split('/').filter(Boolean);
  const completingNextSegment = prefix.endsWith('/');
  for (const template of STATIC_PATHS) {
    const templateParts = template.split('/').filter(Boolean);
    if (inputParts.length > templateParts.length) continue;
    if (completingNextSegment && templateParts.length !== inputParts.length + 1) continue;
    let matches = true;
    const resolvedParts = templateParts.map((part, index) => {
      if (part.startsWith('{') && part.endsWith('}')) {
        if (inputParts[index] === undefined) return part;
        return inputParts[index];
      }
      if (inputParts[index] !== undefined) {
        const isPartialFinalSegment = !completingNextSegment &&
          index === inputParts.length - 1 &&
          inputParts.length === templateParts.length;
        if (isPartialFinalSegment ? !part.startsWith(inputParts[index]) : inputParts[index] !== part) {
          matches = false;
        }
      }
      return part;
    });
    const candidate = `/${resolvedParts.join('/')}`;
    if (matches && candidate.startsWith(prefix)) {
      candidates.add(candidate);
    }
  }
  return [...candidates];
}

function collectionFor(input) {
  return DYNAMIC_COLLECTIONS.find(({ matches }) => matches(input));
}

function extractItems(body, collection) {
  const container = body && body[collection.responseKey];
  return Array.isArray(container && container.items) ? container.items : [];
}

function dynamicCandidates(input, body) {
  const collection = collectionFor(input);
  if (!collection) {
    return [];
  }
  const partial = input.slice(collection.pathPrefix(input).length).toLowerCase();
  return extractItems(body, collection)
    .map((item) => item[collection.key] === undefined ? '' : String(item[collection.key]))
    .filter((value) => value && value.toLowerCase().startsWith(partial));
}

function referenceRoot() {
  return path.resolve(__dirname, '../ref/akamai-apis/apis/papi/v1');
}

module.exports = {
  pathCandidates,
  collectionFor,
  dynamicCandidates,
  referenceRoot
};
