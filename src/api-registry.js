'use strict';

const fs = require('fs');
const path = require('path');

const API_MODULES = fs.readdirSync(path.join(__dirname, 'apis'))
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => require(path.join(__dirname, 'apis', file)));

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
  return moduleForMethod('GET', apiPath).get(settings, apiPath, query, requestGet);
}

function dispatch(method, settings, apiPath, query = {}, body, requestMethod) {
  return moduleForMethod(method, apiPath)
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
  return [[...new Set(results.flatMap(([candidates]) => candidates))], apiPath];
}

async function complete(apiPath, settings, cache, requestGet) {
  const modules = modulesFor(apiPath);
  if (!modules.length) {
    throw new Error(`No API module supports path "${apiPath}"`);
  }
  const results = await Promise.all(modules.map((apiModule) =>
    apiModule.complete(apiPath, settings, cache, requestGet)));
  return [[...new Set(results.flatMap(([candidates]) => candidates))], apiPath];
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
  queryParameters
};
