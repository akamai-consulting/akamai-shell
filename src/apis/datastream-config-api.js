'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/datastream-config-api/v2';
const CATALOG = loadOpenApiCatalog({ service: 'datastream-config-api/v2' });

// PATCH, DELETE, and activation workflows are intentionally outside the shell's
// supported write operations. Keep the declarations aligned with the commands
// exposed by the generic registry and transport layers.
const SUPPORTED_METHODS = {
  GET: CATALOG.methodPaths.GET || [],
  POST: ['/log/streams'],
  PUT: ['/log/streams/{streamId}']
};

function ancestors(paths) {
  const result = new Set();
  for (const endpoint of paths) {
    const parts = endpoint.split('/').filter(Boolean);
    for (let length = 1; length <= parts.length; length += 1) {
      result.add(`/${parts.slice(0, length).join('/')}`);
    }
  }
  return [...result];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/log\/groups\/[^/]*$/,
    collection: '/log/groups',
    prefix: '/log/groups/',
    response: (body) => body && Array.isArray(body.groups) ? body.groups : [],
    key: 'groupId'
  },
  {
    matches: /^\/log\/streams\/[^/]*$/,
    collection: '/log/streams',
    prefix: '/log/streams/',
    response: (body) => body && Array.isArray(body.streams) ? body.streams : [],
    key: 'streamId'
  }
];

module.exports = createApiModule({
  name: 'DataStreamConfig',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: ancestors(SUPPORTED_METHODS.GET),
  methodPaths: SUPPORTED_METHODS,
  methodStaticPaths: Object.fromEntries(Object.entries(SUPPORTED_METHODS)
    .filter(([method]) => method !== 'GET')
    .map(([method, paths]) => [method, ancestors(paths)])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
