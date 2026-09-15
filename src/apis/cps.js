'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cps/v2';
const CATALOG = loadOpenApiCatalog({ service: 'cps/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

function enrollmentId(location) {
  const match = typeof location === 'string' &&
    location.match(/\/enrollments\/([^/]+)/);
  return match ? match[1] : undefined;
}

function enrollmentItems(body) {
  if (!body || !Array.isArray(body.enrollments)) return [];
  return body.enrollments
    .map((enrollment) => ({
      enrollmentId: enrollmentId(enrollment && enrollment.location)
    }))
    .filter(({ enrollmentId: id }) => id !== undefined);
}

function changeItems(body) {
  if (!body || !Array.isArray(body.pendingChanges)) return [];
  return body.pendingChanges
    .map((location) => {
      const match = typeof location === 'string' &&
        location.match(/\/changes\/([^/]+)/);
      return match ? { changeId: match[1] } : undefined;
    })
    .filter(Boolean);
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/enrollments\/[^/]*$/,
    collection: '/enrollments',
    prefix: '/enrollments/',
    response: enrollmentItems,
    key: 'enrollmentId'
  },
  {
    matches: /^\/enrollments\/[^/]+\/changes\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 3).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 3).join('/')}/changes/`,
    response: changeItems,
    key: 'changeId'
  }
];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

module.exports = createApiModule({
  name: 'CPS',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: [...new Set(SUPPORTED_METHODS.flatMap((method) => methodPaths[method]))],
  methodPaths,
  methodStaticPaths: Object.fromEntries(
    Object.entries(CATALOG.methodStaticPaths)
      .filter(([method]) => SUPPORTED_METHODS.includes(method))
  ),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
