'use strict';

const EdgeGrid = require('akamai-edgegrid');

function parseBody(body) {
  if (Buffer.isBuffer(body)) return body;
  if (!body) return null;
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
  return new EdgeGrid({ path: settings.edgerc, section: settings.edgercSection });
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

async function request(settings, apiPath, query = {}, clientFactory = createClient,
  prefix = '', headers = { Accept: 'application/json' }) {
  const normalizedPath = normalizePath(apiPath);
  const qs = { ...(settings.parameterDefaults || {}), ...query };
  if (settings.accountSwitchKey && qs.accountSwitchKey === undefined) {
    qs.accountSwitchKey = settings.accountSwitchKey;
  }
  const response = await send(clientFactory(settings), {
    path: `${prefix}${normalizedPath}`,
    method: 'GET',
    headers,
    qs
  });
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: parseBody(response.body)
  };
}

module.exports = { request, normalizePath, send, parseBody, createClient };
