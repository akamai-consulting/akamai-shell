'use strict';

const transport = require('./edgegrid-transport');

const PAPI_PREFIX = '/papi/v1';
const CONTEXT_QUERY_PATHS = ['/cpcodes', '/edgehostnames', '/products', '/properties'];
const REQUIRED_QUERY_PARAMETERS = [
  { path: '/cpcodes', parameters: ['contractId', 'groupId'] },
  { path: '/edgehostnames', parameters: ['contractId', 'groupId'] },
  { path: '/products', parameters: ['contractId'] },
  { path: '/properties', parameters: ['contractId', 'groupId'] }
];

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
  const qs = { ...(settings.parameterDefaults || {}), ...query };
  const supportsContext = CONTEXT_QUERY_PATHS.some((path) =>
    normalizedPath === path || normalizedPath.startsWith(`${path}/`));
  if (settings.accountSwitchKey && qs.accountSwitchKey === undefined) {
    qs.accountSwitchKey = settings.accountSwitchKey;
  }
  if (supportsContext) {
    if (settings.contractId && qs.contractId === undefined) qs.contractId = settings.contractId;
    if (settings.groupId && qs.groupId === undefined) qs.groupId = settings.groupId;
  }
  validateRequiredParameters(normalizedPath, qs);

  return transport.request(settings, normalizedPath, qs, clientFactory, PAPI_PREFIX, {
    Accept: 'application/json',
    'PAPI-Use-Prefixes': 'true'
  });
}

async function requestMethod(settings, apiPath, method, query = {}, body,
  clientFactory = transport.createClient) {
  const normalizedPath = transport.normalizePath(apiPath);
  const qs = { ...(settings.parameterDefaults || {}), ...query };
  if (settings.accountSwitchKey && qs.accountSwitchKey === undefined) {
    qs.accountSwitchKey = settings.accountSwitchKey;
  }
  const supportsContext = CONTEXT_QUERY_PATHS.some((path) =>
    normalizedPath === path || normalizedPath.startsWith(`${path}/`));
  if (supportsContext) {
    if (settings.contractId && qs.contractId === undefined) qs.contractId = settings.contractId;
    if (settings.groupId && qs.groupId === undefined) qs.groupId = settings.groupId;
  }
  validateRequiredParameters(normalizedPath, qs);
  return transport.requestMethod(settings, normalizedPath, method, qs, body, clientFactory,
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
