'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/config-media-live/v2';
const CATALOG = loadOpenApiCatalog({ service: 'config-media-live/v2' });

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/msl-origin\/origins\/[^/]*$/,
    collection: '/msl-origin/origins',
    prefix: '/msl-origin/origins/',
    response: (body) => Array.isArray(body) ? body : [],
    key: 'id'
  },
  {
    matches: /^\/msl-origin\/streams\/[^/]*$/,
    collection: '/msl-origin/streams',
    prefix: '/msl-origin/streams/',
    response: (body) => body && Array.isArray(body.streams) ? body.streams : [],
    key: 'id'
  }
];

module.exports = createApiModule({
  name: 'ConfigMediaLive',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: CATALOG.methodPaths,
  methodStaticPaths: CATALOG.methodStaticPaths,
  dynamicCollections: DYNAMIC_COLLECTIONS
});
