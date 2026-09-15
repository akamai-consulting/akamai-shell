'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/crux/v1';
const CATALOG = loadOpenApiCatalog({ service: 'crux/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

function objects(body) {
  return body && Array.isArray(body.objects) ? body.objects : [];
}

function objectIds(key = 'uuid_url') {
  return (body) => objects(body)
    .filter((item) => item && item[key] !== undefined);
}

const DYNAMIC_COLLECTIONS = [
  ['agents', 'uuid_url'],
  ['appbundle', 'uuid_url'],
  ['appcategories', 'uuid_url'],
  ['appdirectories', 'uuid_url'],
  ['appgroups', 'uuid_url'],
  ['appidp', 'uuid_url'],
  ['apps', 'uuid_url'],
  ['certificates', 'uuid_url'],
  ['directories', 'uuid_url'],
  ['groupmembership', 'uuid_url'],
  ['idp', 'uuid_url'],
  ['idpdirectory', 'uuid_url'],
  ['services', 'id']
].map(([resource, key]) => ({
  matches: new RegExp(`^/mgmt-pop/${resource}/[^/]*$`),
  collection: `/mgmt-pop/${resource}`,
  prefix: `/mgmt-pop/${resource}/`,
  response: objectIds(key),
  key
}));

module.exports = createApiModule({
  name: 'Crux',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodPaths[method] || []
  ])),
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodStaticPaths[method] || []
  ])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
