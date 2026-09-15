'use strict';

const fs = require('fs');
const path = require('path');

const API_MODULES = fs.readdirSync(path.join(__dirname, 'apis'))
  .filter((file) => file.endsWith('.js'))
  .sort()
  .map((file) => require(path.join(__dirname, 'apis', file)));

function register(apiModule) {
  if (!apiModule || typeof apiModule.supports !== 'function' ||
      typeof apiModule.get !== 'function' || typeof apiModule.complete !== 'function') {
    throw new TypeError('API module must provide supports, get, and complete functions');
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

function get(settings, apiPath, query, requestGet) {
  return moduleFor(apiPath).get(settings, apiPath, query, requestGet);
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
  moduleFor,
  get,
  complete,
  completeSetting,
  queryParameters
};
