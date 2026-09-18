'use strict';

const transport = require('./edgegrid-transport');
const { openApiCatalog } = require('./catalog');

const PAPI_PREFIX = '/papi/v1';
const CONTEXT_QUERY_PATHS = ['/cpcodes', '/edgehostnames', '/products', '/properties'];
const REQUIRED_QUERY_PARAMETERS = [
  { path: '/cpcodes', parameters: ['contractId', 'groupId'] },
  { path: '/edgehostnames', parameters: ['contractId', 'groupId'] },
  { path: '/products', parameters: ['contractId'] },
  { path: '/properties', parameters: ['contractId', 'groupId'] }
];

function queryParametersFor(apiPath, method) {
  const actual = apiPath.split('/').filter(Boolean);
  const operations = openApiCatalog.operations.filter((operation) => {
    if (operation.method !== method.toUpperCase()) return false;
    const expected = operation.path.split('/').filter(Boolean);
    return expected.length === actual.length && expected.every((part, index) =>
      (part.startsWith('{') && part.endsWith('}')) || part === actual[index]);
  });
  return new Set(operations.flatMap((operation) =>
    (operation.parameters || [])
      .filter((parameter) => parameter.in === 'query')
      .map((parameter) => parameter.name)));
}

function defaultQuery(settings, apiPath, method, query) {
  const supported = queryParametersFor(apiPath, method);
  const defaults = Object.fromEntries(Object.entries(settings.parameterDefaults || {})
    .filter(([name]) => supported.has(name)));
  return { ...defaults, ...query };
}

function requiredParametersFor(apiPath) {
  return REQUIRED_QUERY_PARAMETERS.find(({ path }) =>
    apiPath === path || (apiPath.startsWith(`${path}/`) && path !== '/properties'));
}

function validateRequiredParameters(apiPath, query) {
  const definition = requiredParametersFor(apiPath);
  if (!definition) return;
  const missing = definition.parameters.filter((parameter) =>
    query[parameter] === undefined || query[parameter] === '');
  if (missing.length) {
    throw new Error(`Missing required query parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
}

async function get(settings, apiPath, query = {}, clientFactory = transport.createClient) {
  const normalizedPath = transport.normalizePath(apiPath);
  const qs = defaultQuery(settings, normalizedPath, 'GET', query);
  const target = settings.target || settings;
  const supported = queryParametersFor(normalizedPath, 'GET');
  const supportsContext = CONTEXT_QUERY_PATHS.some((path) =>
    normalizedPath === path || normalizedPath.startsWith(`${path}/`));
  if (target.accountSwitchKey && supported.has('accountSwitchKey') &&
      qs.accountSwitchKey === undefined) {
    qs.accountSwitchKey = target.accountSwitchKey;
  }
  if (supportsContext) {
    if (target.contractId && supported.has('contractId') && qs.contractId === undefined) qs.contractId = target.contractId;
    if (target.groupId && supported.has('groupId') && qs.groupId === undefined) qs.groupId = target.groupId;
  }
  validateRequiredParameters(normalizedPath, qs);

  return transport.request({
    ...settings, parameterDefaults: {}, recorder: settings.recorder
  }, normalizedPath, qs, clientFactory, PAPI_PREFIX, {
    Accept: 'application/json',
    'PAPI-Use-Prefixes': 'true'
  });
}

async function requestMethod(settings, apiPath, method, query = {}, body,
  clientFactory = transport.createClient) {
  const normalizedPath = transport.normalizePath(apiPath);
  const qs = defaultQuery(settings, normalizedPath, method, query);
  const target = settings.target || settings;
  const supported = queryParametersFor(normalizedPath, method);
  if (target.accountSwitchKey && supported.has('accountSwitchKey') && qs.accountSwitchKey === undefined) {
    qs.accountSwitchKey = target.accountSwitchKey;
  }
  const supportsContext = CONTEXT_QUERY_PATHS.some((path) =>
    normalizedPath === path || normalizedPath.startsWith(`${path}/`));
  if (supportsContext) {
    if (target.contractId && supported.has('contractId') && qs.contractId === undefined) qs.contractId = target.contractId;
    if (target.groupId && supported.has('groupId') && qs.groupId === undefined) qs.groupId = target.groupId;
  }
  validateRequiredParameters(normalizedPath, qs);
  return transport.requestMethod({
    ...settings, parameterDefaults: {}, recorder: settings.recorder
  }, normalizedPath, method, qs, body, clientFactory,
    PAPI_PREFIX, {
      Accept: 'application/json',
      'PAPI-Use-Prefixes': 'true'
    });
}

module.exports = {
  get,
  requestMethod,
  normalizePath: transport.normalizePath,
  PAPI_PREFIX,
  send: transport.send,
  request: transport.request,
  requiredParametersFor,
  validateRequiredParameters
};
