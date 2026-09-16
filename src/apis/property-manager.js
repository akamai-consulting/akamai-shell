'use strict';

const { get, requestMethod } = require('../papi-client');
const { createApiModule } = require('../api-module');
const {
  staticPaths,
  dynamicCollections,
  methodPaths,
  methodStaticPaths,
  queryParameters
} = require('../catalog');
const {
  requestCacheKey,
  cachedRequest
} = require('../path-completion');

const PREFIX = '/papi/v1';
const CONTEXT_LOOKUPS = {
  'contract-id': { path: '/contracts', responseKey: 'contracts' },
  'group-id': { path: '/groups', responseKey: 'groups' }
};

function contextCandidates(setting, body, partial = '') {
  const lookup = CONTEXT_LOOKUPS[setting];
  if (!lookup) return [];
  const items = body && body[lookup.responseKey] && body[lookup.responseKey].items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => setting === 'contract-id' ? item.contractId : item.groupId)
    .filter((id) => id && id.toLowerCase().startsWith(partial.toLowerCase()));
}

const PropertyManager = createApiModule({
  name: 'PropertyManager',
  prefix: PREFIX,
  queryParameters,
  staticPaths,
  dynamicCollections,
  request: get,
  requestMethod,
  methodPaths: {
    GET: methodPaths.GET || [],
    POST: methodPaths.POST || [],
    PUT: methodPaths.PUT || []
  },
  methodStaticPaths
});

PropertyManager.contextCandidates = contextCandidates;
PropertyManager.completeSetting = async function completeSetting(
  setting,
  partial,
  settings,
  cache,
  requestGet = get
) {
  const lookup = CONTEXT_LOOKUPS[setting];
  if (!lookup) return [[], partial];
  const cacheKey = requestCacheKey(PREFIX, lookup.path, settings);
  try {
    const body = await cachedRequest(cache, cacheKey, async () =>
      (await requestGet(settings, lookup.path)).body);
    return [contextCandidates(setting, body, partial), partial];
  } catch {
    return [[], partial];
  }
};

module.exports = PropertyManager;
