'use strict';

const path = require('path');

const STATIC_PATHS = [
  '/build',
  '/groups',
  '/contracts',
  '/products',
  '/cpcodes',
  '/edgehostnames',
  '/edgehostnames/',
  '/hostnames',
  '/properties',
  '/properties/',
  '/properties/{propertyId}',
  '/properties/{propertyId}/versions',
  '/properties/{propertyId}/versions/',
  '/properties/{propertyId}/versions/latest',
  '/properties/{propertyId}/versions/{propertyVersion}',
  '/properties/{propertyId}/versions/{propertyVersion}/available-behaviors',
  '/properties/{propertyId}/versions/{propertyVersion}/available-criteria',
  '/properties/{propertyId}/versions/{propertyVersion}/hostnames',
  '/properties/{propertyId}/versions/{propertyVersion}/includes',
  '/properties/{propertyId}/versions/{propertyVersion}/rules'
];

const DYNAMIC_COLLECTIONS = [
  { template: '/edgehostnames/', collection: '/edgehostnames', responseKey: 'edgeHostnames', key: 'edgeHostnameId' },
  { template: '/properties/', collection: '/properties', responseKey: 'properties', key: 'propertyId' }
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
  return DYNAMIC_COLLECTIONS.find(({ template }) => {
    if (!input.startsWith(template)) return false;
    return !input.slice(template.length).includes('/');
  });
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
  const partial = input.slice(collection.template.length).toLowerCase();
  return extractItems(body, collection)
    .map((item) => item[collection.key])
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
