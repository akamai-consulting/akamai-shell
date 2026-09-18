'use strict';

const fs = require('fs');
const path = require('path');
const { sortCandidates } = require('./path-completion');
const { loadOpenApiCatalog, REFERENCE_ROOT } = require('./openapi-catalog');

const API_MODULES = fs.readdirSync(path.join(__dirname, 'apis'))
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => require(path.join(__dirname, 'apis', file)));
const CATALOG_CACHE = new Map();

function register(apiModule) {
  if (!apiModule || typeof apiModule.supports !== 'function' ||
      typeof apiModule.get !== 'function' || typeof apiModule.complete !== 'function' ||
      typeof apiModule.supportsMethod !== 'function' ||
      typeof apiModule.dispatch !== 'function') {
    throw new TypeError('API module must provide supports, supportsMethod, get, dispatch, and complete functions');
  }
  API_MODULES.unshift(apiModule);
}

function moduleFor(apiPath) {
  const apiModule = modulesFor(apiPath)[0];
  if (!apiModule) {
    throw new Error(`No API module supports path "${apiPath}"`);
  }
  return apiModule;
}

function modulesFor(apiPath) {
  return API_MODULES.filter((candidate) => candidate.supports(apiPath));
}

function modulesForMethod(method, apiPath) {
  return API_MODULES.filter((candidate) => candidate.supportsMethod(method, apiPath));
}

function moduleForMethod(method, apiPath) {
  const apiModule = modulesForMethod(method, apiPath)[0];
  if (!apiModule) {
    if (modulesFor(apiPath).length) {
      throw new Error(`No API module supports ${method.toUpperCase()} path "${apiPath}"`);
    }
    throw new Error(`No API module supports path "${apiPath}"`);
  }
  return apiModule;
}

function get(settings, apiPath, query, requestGet) {
  const apiModule = moduleForMethod('GET', apiPath);
  settings.logger?.debug('API module selected', { module: apiModule.name, method: 'GET', path: apiPath });
  return apiModule.get(settings, apiPath, query, requestGet);
}

function dispatch(method, settings, apiPath, query = {}, body, requestMethod) {
  const apiModule = moduleForMethod(method, apiPath);
  settings.logger?.debug('API module selected', {
    module: apiModule.name, method: method.toUpperCase(), path: apiPath
  });
  return apiModule
    .dispatch(settings, apiPath, method, query, body, requestMethod);
}

function post(settings, apiPath, query, body, requestMethod) {
  return dispatch('POST', settings, apiPath, query, body, requestMethod);
}

function put(settings, apiPath, query, body, requestMethod) {
  return dispatch('PUT', settings, apiPath, query, body, requestMethod);
}

async function completeMethod(method, apiPath, settings, cache, requestGet) {
  const modules = API_MODULES.filter((candidate) =>
    (typeof candidate.supportsCompletion === 'function'
      ? candidate.supportsCompletion(method, apiPath)
      : candidate.supportsMethod(method, apiPath)));
  if (!modules.length && method.toUpperCase() === 'GET') {
    return [[], apiPath];
  }
  if (!modules.length) {
    return [[], apiPath];
  }
  const results = await Promise.all(modules.map((apiModule) =>
    apiModule.completeMethod(method, apiPath, settings, cache, requestGet)));
  return [sortCandidates(new Set(results.flatMap(([candidates]) => candidates))), apiPath];
}

async function complete(apiPath, settings, cache, requestGet) {
  const modules = modulesFor(apiPath);
  if (!modules.length) {
    throw new Error(`No API module supports path "${apiPath}"`);
  }
  const results = await Promise.all(modules.map((apiModule) =>
    apiModule.complete(apiPath, settings, cache, requestGet)));
  return [sortCandidates(new Set(results.flatMap(([candidates]) => candidates))), apiPath];
}

function completeSetting(setting, partial, settings, cache, requestGet) {
  const apiModule = API_MODULES.find((candidate) => candidate.completeSetting);
  return apiModule
    ? apiModule.completeSetting(setting, partial, settings, cache, requestGet)
    : [[], partial];
}

function queryParameters() {
  return [...new Set(API_MODULES.flatMap((apiModule) =>
    apiModule.queryParameters || []))];
}

function catalogForPrefix(prefix) {
  if (CATALOG_CACHE.has(prefix)) return CATALOG_CACHE.get(prefix);
  const service = prefix.replace(/^\/|\/$/g, '');
  const candidates = [
    path.join(REFERENCE_ROOT, service, 'openapi.json'),
    path.join(REFERENCE_ROOT, service.replace(/\/v\d+$/, ''), 'openapi.json'),
    path.join(REFERENCE_ROOT, service.replace(/\/api\/v\d+$/, '/v2'), 'openapi.json')
  ];
  let catalog = null;
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    catalog = loadOpenApiCatalog({ filePath });
    break;
  }
  CATALOG_CACHE.set(prefix, catalog);
  return catalog;
}

function pathMatchesTemplate(apiPath, template) {
  const actual = apiPath.split('/').filter(Boolean);
  const expected = template.split('/').filter(Boolean);
  return actual.length === expected.length && expected.every((part, index) =>
    (part.startsWith('{') && part.endsWith('}')) || part === actual[index]);
}

function hasCompletionDescendants(apiPath, method = 'GET') {
  return API_MODULES.some((apiModule) => {
    if (!apiModule.supports(apiPath)) return false;
    const relative = apiPath === apiModule.prefix
      ? '/'
      : apiPath.slice(apiModule.prefix.length);
    const actual = relative.split('/').filter(Boolean);
    const paths = apiModule.methodStaticPaths?.[method.toUpperCase()] ||
      apiModule.staticPaths || [];
    const hasDescendant = (candidates) => candidates.some((template) => {
      const expected = template.split('/').filter(Boolean);
      return expected.length > actual.length && actual.every((part, index) => {
        const expectedPart = expected[index];
        return expectedPart.startsWith('{') && expectedPart.endsWith('}')
          ? true : expectedPart === part;
      });
    });
    if (hasDescendant(paths) ||
        (method.toUpperCase() !== 'GET' &&
         hasDescendant(apiModule.methodStaticPaths?.GET || []))) return true;
    return (apiModule.dynamicCollections || []).some((descriptor) => {
      if (typeof descriptor.matches !== 'function' ||
          !descriptor.matches(relative)) return false;
      const prefix = typeof descriptor.prefix === 'function'
        ? descriptor.prefix(relative) : descriptor.prefix;
      return prefix === `${relative}/`;
    });
  });
}

function parameterHelp(method, apiPath, parameterName) {
  return modulesFor(apiPath).flatMap((apiModule) => {
    const catalog = catalogForPrefix(apiModule.prefix);
    if (!catalog) return [];
    const relative = apiPath === apiModule.prefix
      ? '/'
      : apiPath.slice(apiModule.prefix.length);
    const operations = catalog.operations.filter((operation) =>
      operation.method === method.toUpperCase() &&
      (relative === '/' || pathMatchesTemplate(relative, operation.path)));
    const parameters = operations.flatMap((operation) => operation.parameters || []);
    const unique = new Map(parameters.map((parameter) => [parameter.name, parameter]));
    const filtered = [...unique.values()].filter((parameter) =>
      !parameterName || parameter.name === parameterName);
    return typeof apiModule.filterParameterHelp === 'function'
      ? apiModule.filterParameterHelp(method, apiPath, filtered)
      : filtered;
  });
}

module.exports = {
  API_MODULES,
  register,
  modulesFor,
  modulesForMethod,
  moduleFor,
  moduleForMethod,
  dispatch,
  get,
  post,
  put,
  complete,
  completeMethod,
  completeSetting,
  queryParameters,
  parameterHelp,
  hasCompletionDescendants,
  catalogForPrefix
};
