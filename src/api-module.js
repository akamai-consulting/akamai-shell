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
  requestMethod,
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

  function requestApi(settings, apiPath, query, requestHandler, method = 'GET', body,
    headerOverrides) {
    settings.logger?.debug('API request dispatch', { module: name, method, path: apiPath });
    const headerArgs = headerOverrides && Object.keys(headerOverrides).length
      ? [headerOverrides] : [];
    if (requestHandler) {
      if (method === 'GET') return requestHandler(settings, apiPath, query, ...headerArgs);
      return requestHandler(settings, apiPath, query, body, method, ...headerArgs);
    }
    if (method === 'GET' && request) {
      return headerArgs.length
        ? request(settings, apiPath, query, undefined, ...headerArgs)
        : request(settings, apiPath, query);
    }
    if (method !== 'GET' && requestMethod) {
      return headerArgs.length
        ? requestMethod(settings, apiPath, method, query, body, undefined, ...headerArgs)
        : requestMethod(settings, apiPath, method, query, body);
    }
    const headers = typeof requestHeaders === 'function'
      ? requestHeaders(settings, method, apiPath)
      : undefined;
    return transport.requestMethod(
      settings, apiPath, method, query, body, undefined, prefix, headers, headerOverrides
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
    const methodPaths = normalizedMethod === 'GET'
      ? staticPaths : normalizedMethodStaticPaths[normalizedMethod] || [];
    const paths = normalizedMethod !== 'GET' && normalizedMethodPaths.GET?.length &&
        !methodPaths.some((template) => templatePrefixMatches(input, template))
      ? staticPaths : methodPaths;
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
    dynamicCollections,

    supports(apiPath) {
      return supportsPrefix(prefix, apiPath);
    },

    supportsMethod,
    supportsCompletion,

    get(settings, apiPath, query, requestGet, headers) {
      return requestApi(
        settings, relativePath(prefix, apiPath), query, requestGet, 'GET', undefined, headers
      );
    },

    dispatch(settings, apiPath, method, query = {}, body, requestMethod, headers) {
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
        body,
        headers
      );
    },

    async complete(apiPath, settings, cache, requestGet) {
      return this.completeMethod('GET', apiPath, settings, cache, requestGet);
    },

    async completeMethod(method, apiPath, settings, cache, requestGet) {
      settings.logger?.debug('API completion', { module: name, method, path: apiPath });
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
      const methodPaths = normalizedMethod === 'GET'
        ? staticPaths : normalizedMethodStaticPaths[normalizedMethod] || [];
      const pathsForCompletion = normalizedMethod !== 'GET' && normalizedMethodPaths.GET?.length &&
          !methodPaths.some((template) => templatePrefixMatches(input, template))
        ? staticPaths : methodPaths;
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
