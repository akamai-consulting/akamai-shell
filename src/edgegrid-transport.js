'use strict';

const EdgeGrid = require('akamai-edgegrid');
const { redact } = require('./logger');

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
  return requestMethod(settings, apiPath, 'GET', query, undefined, clientFactory, prefix, headers);
}

async function requestMethod(settings, apiPath, method, query = {}, body,
  clientFactory = createClient, prefix = '', headers = { Accept: 'application/json' }) {
  const normalizedPath = normalizePath(apiPath);
  const normalizedMethod = String(method || '').toUpperCase();
  if (!normalizedMethod) throw new Error('HTTP method is required');
  const qs = { ...(settings.parameterDefaults || {}), ...query };
  if (settings.accountSwitchKey && qs.accountSwitchKey === undefined) {
    qs.accountSwitchKey = settings.accountSwitchKey;
  }
  const requestHeaders = { ...headers };
  if (body !== undefined && requestHeaders['Content-Type'] === undefined &&
      requestHeaders['content-type'] === undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  const request = {
    path: `${prefix}${normalizedPath}`,
    method: normalizedMethod,
    headers: requestHeaders,
    qs,
    ...(body === undefined ? {} : { body })
  };
  const recording = settings.recorder?.begin(request);
  settings.logger?.debug('HTTP request', redact(request));
  let response;
  try {
    response = await send(clientFactory(settings), request);
  } catch (error) {
    settings.recorder?.complete(recording, undefined, error);
    settings.logger?.error('HTTP request failed', {
      method: normalizedMethod,
      path: request.path,
      statusCode: error.statusCode,
      message: error.message,
      body: error.body
    });
    throw error;
  }
  const parsedResponse = {
    statusCode: response.statusCode,
    headers: response.headers,
    body: parseBody(response.body)
  };
  settings.recorder?.complete(recording, parsedResponse);
  settings.logger?.debug('HTTP response', {
    statusCode: response.statusCode,
    headers: response.headers,
    body: parsedResponse.body
  });
  return parsedResponse;
}

module.exports = {
  request,
  requestMethod,
  requestWithMethod: requestMethod,
  normalizePath,
  send,
  parseBody,
  createClient
};
