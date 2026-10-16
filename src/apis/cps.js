'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cps/v2';
const CATALOG = loadOpenApiCatalog({ service: 'cps/v2' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];
const INPUT_TYPE_MEDIA_FAMILIES = {
  'change-management-info': 'change-management-info',
  'lets-encrypt-challenges': 'dv-challenges',
  'post-verification-warnings': 'warnings',
  'pre-verification-warnings': 'warnings',
  'third-party-csr': 'csr'
};

function operationFor(method, apiPath) {
  const pathParts = apiPath.split('/').filter(Boolean);
  return CATALOG.operations.find((operation) => {
    const operationParts = operation.path.split('/').filter(Boolean);
    if (operation.method !== method || operationParts.length !== pathParts.length) {
      return false;
    }
    return operationParts.every((part, index) =>
      (part.startsWith('{') && part.endsWith('}')) || part === pathParts[index]);
  });
}

function latestMediaType(mediaTypes, family) {
  let latest;
  let latestVersion = -1;
  for (const mediaType of mediaTypes) {
    const match = mediaType.match(new RegExp(`\\.${family}\\.v(\\d+)\\+json$`));
    if (match && Number(match[1]) > latestVersion) {
      latest = mediaType;
      latestVersion = Number(match[1]);
    }
  }
  return latest;
}

function defaultAccept(method, apiPath) {
  const operation = operationFor(method, apiPath);
  if (!operation || !operation.responseContentTypes.length) return undefined;
  if (operation.responseContentTypes.length === 1) return operation.responseContentTypes[0];

  const inputTypeMatch = apiPath.match(/\/input\/info\/([^/]+)$/);
  const mediaFamily = inputTypeMatch && INPUT_TYPE_MEDIA_FAMILIES[inputTypeMatch[1]];
  if (mediaFamily) {
    const mediaType = latestMediaType(operation.responseContentTypes, mediaFamily);
    if (mediaType) return mediaType;
  }
  return operation.parameters.find((parameter) =>
    parameter.in === 'header' && parameter.name.toLowerCase() === 'accept')
    ?.schema?.example || operation.responseContentTypes[0];
}

function requestHeaders(settings, method, apiPath) {
  const accept = defaultAccept(method, apiPath);
  return accept ? { Accept: accept } : undefined;
}

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
  dynamicCollections: DYNAMIC_COLLECTIONS,
  requestHeaders
});
