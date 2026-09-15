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
  methodPaths = {},
  methodStaticPaths = {},
  combineStaticCandidates = false,
  requestHeaders,
  bodyRequired = {}
}) {
  const normalizedMethodPaths = Object.fromEntries(
    Object.entries(methodPaths).map(([method, paths]) => [
      method.toUpperCase(), paths
    ])
  );
  const normalizedMethodStaticPaths = Object.fromEntries(
    Object.entries(methodStaticPaths).map(([method, paths]) => [
      method.toUpperCase(), paths
    ])
  );

  function templatePrefixMatches(input, template) {
    const inputParts = input.split('/').filter(Boolean);
    const templateParts = template.split('/').filter(Boolean);
    if (inputParts.length > templateParts.length) return false;
    return inputParts.every((part, index) => {
      const expected = templateParts[index];
      if (expected.startsWith('{') && expected.endsWith('}')) return true;
      if (index === inputParts.length - 1 && !input.endsWith('/')) {
        return expected.startsWith(part);
      }
      return expected === part;
    });
  }

  function pathMatchesTemplate(apiPath, template) {
    const actual = apiPath.split('/').filter(Boolean);
    const expected = template.split('/').filter(Boolean);
    return actual.length === expected.length && expected.every((part, index) =>
      (part.startsWith('{') && part.endsWith('}')) || part === actual[index]);
  }

  function requestApi(settings, apiPath, query, requestHandler, method = 'GET', body) {
    if (requestHandler) {
      if (method === 'GET') return requestHandler(settings, apiPath, query);
      return requestHandler(settings, apiPath, query, body, method);
    }
    if (method === 'GET' && request) return request(settings, apiPath, query);
    const headers = typeof requestHeaders === 'function'
      ? requestHeaders(settings, method, apiPath)
      : undefined;
    return transport.requestMethod(
      settings, apiPath, method, query, body, undefined, prefix, headers
    );
  }

  function supportsMethod(method, apiPath) {
    const normalizedMethod = String(method || '').toUpperCase();
    return supportsPrefix(prefix, apiPath) &&
      (normalizedMethod in normalizedMethodPaths) &&
      normalizedMethodPaths[normalizedMethod].some((template) =>
        pathMatchesTemplate(relativePath(prefix, apiPath), template));
  }

  function supportsCompletion(method, apiPath) {
    const normalizedMethod = String(method || '').toUpperCase();
    if (!supportsPrefix(prefix, apiPath)) return false;
    const input = relativePath(prefix, apiPath);
    const paths = normalizedMethod === 'GET' ? staticPaths :
      Object.prototype.hasOwnProperty.call(normalizedMethodStaticPaths, normalizedMethod)
        ? normalizedMethodStaticPaths[normalizedMethod] : staticPaths;
    if (apiPath === '/') return paths.length > 0;
    if (prefix.startsWith(apiPath)) return true;
    if (apiPath.startsWith(`${prefix}/`)) {
      return paths.some((template) => templatePrefixMatches(input, template));
    }
    return false;
  }

  return {
    name,
    prefix,
    queryParameters,
    staticPaths,
    methodPaths: normalizedMethodPaths,
    methodStaticPaths: normalizedMethodStaticPaths,

    supports(apiPath) {
      return supportsPrefix(prefix, apiPath);
    },

    supportsMethod,
    supportsCompletion,

    get(settings, apiPath, query, requestGet) {
      return requestApi(settings, relativePath(prefix, apiPath), query, requestGet, 'GET');
    },

    dispatch(settings, apiPath, method, query = {}, body, requestMethod) {
      const normalizedMethod = method.toUpperCase();
      if (bodyRequired[normalizedMethod] !== false &&
          (normalizedMethod === 'POST' || normalizedMethod === 'PUT') &&
          body === undefined) {
        throw new Error(`${normalizedMethod} requires a JSON body`);
      }
      if (!supportsMethod(method, apiPath)) {
        throw new Error(`${normalizedMethod} is not supported for API path "${apiPath}"`);
      }
      return requestApi(
        settings,
        relativePath(prefix, apiPath),
        query,
        requestMethod,
        normalizedMethod,
        body
      );
    },

    async complete(apiPath, settings, cache, requestGet) {
      return this.completeMethod('GET', apiPath, settings, cache, requestGet);
    },

    async completeMethod(method, apiPath, settings, cache, requestGet) {
      if (apiPath === '/') {
        const normalizedMethod = method.toUpperCase();
        const paths = normalizedMethod === 'GET' ? staticPaths :
          Object.prototype.hasOwnProperty.call(normalizedMethodStaticPaths, normalizedMethod)
            ? normalizedMethodStaticPaths[normalizedMethod] : staticPaths;
        if (method.toUpperCase() === 'GET') {
          return [[prefix], apiPath];
        }
        if (paths.length) {
          const candidates = staticCandidates('/', paths)
            .filter((candidate) => !candidate.includes('{') && !candidate.includes('}'))
            .map((candidate) => `${prefix}${candidate}`);
          return [candidates, apiPath];
        }
        return [[], apiPath];
      }
      if (prefix.startsWith(apiPath)) {
        return [[prefix], apiPath];
      }

      const input = relativePath(prefix, apiPath);
      const normalizedMethod = method.toUpperCase();
      const pathsForCompletion = normalizedMethod === 'GET' ? staticPaths :
        Object.prototype.hasOwnProperty.call(normalizedMethodStaticPaths, normalizedMethod)
          ? normalizedMethodStaticPaths[normalizedMethod] : staticPaths;
      const staticMatches = staticCandidates(input, pathsForCompletion)
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
