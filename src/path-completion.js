'use strict';

function hasIncompleteDynamicSegment(input, template) {
  if (input.endsWith('/')) return false;
  const inputParts = input.split('/').filter(Boolean);
  const templateParts = template.split('/').filter(Boolean);
  if (templateParts.length < inputParts.length) return false;
  return inputParts.some((part, index) =>
    templateParts[index] && templateParts[index].startsWith('{') &&
    templateParts[index].endsWith('}') && index === inputParts.length - 1);
}

function supportsPrefix(prefix, apiPath) {
  return apiPath === '/' || apiPath === prefix || prefix.startsWith(apiPath) ||
    apiPath.startsWith(`${prefix}/`);
}

function relativePath(prefix, apiPath) {
  if (apiPath === prefix) return '/';
  return apiPath.startsWith(`${prefix}/`) ? apiPath.slice(prefix.length) : apiPath;
}

function staticCandidates(input, templates) {
  const prefix = input || '/';
  const candidates = new Set();
  const inputParts = prefix.split('/').filter(Boolean);
  const completingNextSegment = prefix.endsWith('/');

  for (const template of templates) {
    const templateParts = template.split('/').filter(Boolean);
    if (hasIncompleteDynamicSegment(prefix, template)) continue;
    if (inputParts.length > templateParts.length) continue;
    if (completingNextSegment && templateParts.length !== inputParts.length + 1) continue;

    let matches = true;
    const resolvedParts = templateParts.map((part, index) => {
      if (part.startsWith('{') && part.endsWith('}')) {
        if (inputParts[index] === undefined) return part;
        return inputParts[index];
      }
      if (inputParts[index] !== undefined) {
        const isPartialFinalSegment = !completingNextSegment &&
          index === inputParts.length - 1 &&
          inputParts.length === templateParts.length;
        if (isPartialFinalSegment
          ? !part.startsWith(inputParts[index])
          : inputParts[index] !== part) {
          matches = false;
        }
      }
      return part;
    });
    const candidate = `/${resolvedParts.join('/')}`;
    if (matches && candidate.startsWith(prefix)) candidates.add(candidate);
  }
  return [...candidates];
}

function dynamicMatches(matches, input) {
  if (typeof matches === 'function') return matches(input);
  if (matches instanceof RegExp) {
    matches.lastIndex = 0;
    return matches.test(input);
  }
  return false;
}

function dynamicCollectionFor(input, collections) {
  return collections.find(({ matches }) => dynamicMatches(matches, input));
}

function descriptorValue(value, input) {
  return typeof value === 'function' ? value(input) : value;
}

function dynamicCandidates(input, body, descriptor) {
  if (!descriptor) return [];
  const prefix = descriptorValue(descriptor.prefix, input);
  const items = typeof descriptor.response === 'function'
    ? descriptor.response(body)
    : [];
  if (!Array.isArray(items)) return [];
  const partial = input.slice(prefix.length).toLowerCase();
  return items
    .map((item) => item && item[descriptor.key])
    .filter((value) => value !== undefined &&
      String(value).toLowerCase().startsWith(partial))
    .map(String);
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
    }
    return value;
}

function requestCacheKey(prefix, collection, settings = {}, query = {}) {
  const requestSettings = {
    edgerc: settings.edgerc,
    edgercSection: settings.edgercSection,
    accountSwitchKey: settings.accountSwitchKey,
    contractId: settings.contractId,
    groupId: settings.groupId,
    parameterDefaults: settings.parameterDefaults || {}
  };
  return `${prefix}|${collection}|${JSON.stringify(stableValue({
    settings: requestSettings,
    query
  }))}`;
}

function cachedValue(cache, key) {
  if (!cache) return { found: false };
  if (typeof cache.has === 'function' && cache.has(key)) {
    return { found: true, value: cache.get(key) };
  }
  const value = typeof cache.get === 'function' ? cache.get(key) : undefined;
  return { found: value !== undefined, value };
}

function cacheValue(cache, key, value) {
  if (cache && typeof cache.set === 'function') cache.set(key, value);
}

async function cachedRequest(cache, key, request) {
  const cached = cachedValue(cache, key);
  if (cached.found) return cached.value;
  const value = await request();
  cacheValue(cache, key, value);
  return value;
}

function restorePrefix(prefix, apiPath, candidates) {
  const fullPath = apiPath === prefix || apiPath.startsWith(`${prefix}/`);
  return fullPath ? candidates.map((candidate) => `${prefix}${candidate}`) : candidates;
}

module.exports = {
    hasIncompleteDynamicSegment,
    supportsPrefix,
    relativePath,
    staticCandidates,
    dynamicCollectionFor,
    dynamicCandidates,
    requestCacheKey,
    cachedValue,
    cacheValue,
    cachedRequest,
    restorePrefix
};
