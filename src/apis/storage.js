'use strict';

const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/storage/v1';
const CATALOG = loadOpenApiCatalog({ service: 'storage/v1' });
const SUPPORTED_METHODS = ['GET', 'POST', 'PUT'];

function collectionItems(key) {
  return (body) => body && Array.isArray(body.items) ? body.items : [];
}

const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/cpcodes\/[^/]*$/,
    collection: '/cpcodes/used',
    prefix: '/cpcodes/',
    response: (body) => collectionItems('items')(body)
      .map((item) => ({ cpcodeId: item && item.cpcodeId })),
    key: 'cpcodeId'
  },
  {
    matches: /^\/rule-sets\/[^/]*$/,
    collection: '/rule-sets',
    prefix: '/rule-sets/',
    response: collectionItems('items'),
    key: 'ruleSetId'
  },
  {
    matches: /^\/site-snapshots\/[^/]*$/,
    collection: '/site-snapshots',
    prefix: '/site-snapshots/',
    response: collectionItems('items'),
    key: 'snapshotId'
  },
  {
    matches: /^\/storage-groups\/[^/]*$/,
    collection: '/storage-groups',
    prefix: '/storage-groups/',
    response: collectionItems('items'),
    key: 'storageGroupId'
  },
  {
    matches: /^\/upload-accounts\/[^/]*$/,
    collection: '/upload-accounts',
    prefix: '/upload-accounts/',
    response: collectionItems('items'),
    key: 'uploadAccountId'
  }
];

const methodPaths = Object.fromEntries(SUPPORTED_METHODS.map((method) => [
  method, CATALOG.methodPaths[method] || []
]));

module.exports = createApiModule({
  name: 'Storage',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: [...new Set(SUPPORTED_METHODS.flatMap((method) => methodPaths[method]))],
  methodPaths,
  methodStaticPaths: Object.fromEntries(SUPPORTED_METHODS.map((method) => [
    method, CATALOG.methodStaticPaths[method] || []
  ])),
  dynamicCollections: DYNAMIC_COLLECTIONS
});
