'use strict';

const transport = require('./edgegrid-transport');
const {
  supportsPrefix,
  relativePath,
  staticCandidates,
  dynamicCollectionFor,
  dynamicCandidates,
  requestCacheKey,
  cachedRequest,
  restorePrefix
} = require('./path-completion');

function createApiModule({
  name,
  prefix,
  queryParameters = [],
  staticPaths = [],
  dynamicCollections = [],
  request,
  combineStaticCandidates = false
}) {
  function requestApi(settings, apiPath, query, requestGet) {
    if (requestGet) return requestGet(settings, apiPath, query);
    if (request) return request(settings, apiPath, query);
    return transport.request(settings, apiPath, query, undefined, prefix);
  }

  return {
    name,
    prefix,
    queryParameters,

    supports(apiPath) {
      return supportsPrefix(prefix, apiPath);
    },

    get(settings, apiPath, query, requestGet) {
      return requestApi(settings, relativePath(prefix, apiPath), query, requestGet);
    },

    async complete(apiPath, settings, cache, requestGet) {
      if (apiPath === '/' || prefix.startsWith(apiPath)) {
        return [[prefix], apiPath];
      }

      const input = relativePath(prefix, apiPath);
      const staticMatches = staticCandidates(input, staticPaths)
        .filter((candidate) => !candidate.includes('{') && !candidate.includes('}'));
      const dynamic = dynamicCollectionFor(input, dynamicCollections);
      if (!dynamic) {
        return [restorePrefix(prefix, apiPath, staticMatches), apiPath];
      }

      const collectionPath = typeof dynamic.collection === 'function'
        ? dynamic.collection(input) : dynamic.collection;
      const cacheKey = requestCacheKey(prefix, collectionPath, settings);
      try {
        const body = await cachedRequest(cache, cacheKey, async () =>
          (await requestApi(settings, collectionPath, {}, requestGet)).body);
        const candidates = dynamicCandidates(input, body, dynamic)
          .map((candidate) => `${typeof dynamic.prefix === 'function'
            ? dynamic.prefix(input) : dynamic.prefix}${candidate}`);
        const combined = combineStaticCandidates
          ? [...new Set([...staticMatches, ...candidates])]
          : candidates;
        return [restorePrefix(prefix, apiPath, combined), apiPath];
      } catch {
        return [[], apiPath];
      }
    }
  };
}

module.exports = { createApiModule };
