'use strict';

const EdgeGrid = require('akamai-edgegrid');

const PAPI_PREFIX = '/papi/v1';
const CONTEXT_QUERY_PATHS = ['/cpcodes', '/edgehostnames', '/products', '/properties'];
const REQUIRED_QUERY_PARAMETERS = [
  { path: '/cpcodes', parameters: ['contractId', 'groupId'] },
  { path: '/edgehostnames', parameters: ['contractId', 'groupId'] },
  { path: '/products', parameters: ['contractId'] },
  { path: '/properties', parameters: ['contractId', 'groupId'] }
];

function parseBody(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function normalizePath(apiPath) {
  if (!apiPath || !apiPath.startsWith('/')) {
    throw new Error('API path must start with "/"');
  }
  if (apiPath.includes('://') || apiPath.includes('..')) {
    throw new Error('Invalid API path');
  }
  return apiPath;
}

function createClient(settings) {
  if (!settings.edgerc || !settings.edgercSection) {
    throw new Error('Set edgerc and edgerc-section before making a request');
  }
  return new EdgeGrid({
    path: settings.edgerc,
    section: settings.edgercSection
  });
}

function send(client, request) {
  return new Promise((resolve, reject) => {
    client.auth(request).send((error, response, body) => {
      if (error) {
        if (error.response) {
          error.statusCode = error.response.status;
          error.headers = error.response.headers;
          error.body = error.response.data;
        }
        reject(error);
        return;
      }
      resolve({
        statusCode: response.status,
        headers: response.headers,
        body
      });
    });
  });
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

async function get(settings, apiPath, query = {}, clientFactory = createClient) {
  const normalizedPath = normalizePath(apiPath);
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

  const client = clientFactory(settings);
  const response = await send(client, {
    path: `${PAPI_PREFIX}${normalizedPath}`,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'PAPI-Use-Prefixes': 'true'
    },
    qs
  });

  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: parseBody(response.body)
  };
}

module.exports = {
  get,
  normalizePath,
  PAPI_PREFIX,
  send,
  requiredParametersFor,
  validateRequiredParameters
};
