'use strict';

const transport = require('../edgegrid-transport');
const { createApiModule } = require('../api-module');
const { loadOpenApiCatalog } = require('../openapi-catalog');

const PREFIX = '/cloudlets/v3';
const CATALOG = loadOpenApiCatalog({ service: 'cloudlets/v3' });
const DYNAMIC_COLLECTIONS = [
  {
    matches: (input) => /^\/policies\/[^/]*$/.test(input),
    collection: '/policies',
    prefix: '/policies/',
    key: 'id',
    response: (body) => body && Array.isArray(body.content) ? body.content : []
  },
  {
    matches: (input) => /^\/policies\/[^/]+\/versions\/[^/]*$/.test(input),
    collection: (input) => `${input.split('/').slice(0, 4).join('/')}`,
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    key: 'version',
    response: (body) => body && Array.isArray(body.content) ? body.content : []
  }
];

function putPolicyVersionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const normalized = {};
  for (const field of ['description', 'configuration', 'matchRules']) {
    if (body[field] !== undefined) normalized[field] = body[field];
  }
  if (normalized.description === null) normalized.description = '';
  if (Array.isArray(normalized.matchRules)) {
    normalized.matchRules = normalized.matchRules.map((rule) => {
      if (!rule || typeof rule !== 'object' || rule.type !== 'igMatchRule') return rule;
      const { matchURL, ...requestControlRule } = rule;
      return requestControlRule;
    });
  }
  return normalized;
}

async function requestMethod(settings, apiPath, method, query, body) {
  const normalizedMethod = method.toUpperCase();
  const normalizedQuery = { ...(query || {}) };
  let normalizedBody = body;
  if (normalizedMethod === 'PUT' && /^\/policies\/[^/]+\/versions\/[^/]+$/.test(apiPath)) {
    normalizedBody = putPolicyVersionBody(body);
  }
  return transport.requestMethod(settings, apiPath, method, normalizedQuery, normalizedBody,
    undefined, PREFIX);
}

const Cloudlets = createApiModule({
  name: 'Cloudlets',
  prefix: PREFIX,
  queryParameters: CATALOG.queryParameters,
  staticPaths: CATALOG.staticPaths,
  methodPaths: {
    GET: CATALOG.methodPaths.GET || [],
    POST: CATALOG.methodPaths.POST || [],
    PUT: CATALOG.methodPaths.PUT || []
  },
  requestMethod,
  methodStaticPaths: Object.fromEntries(Object.entries(CATALOG.methodStaticPaths)
    .filter(([method]) => method !== 'GET')),
  dynamicCollections: DYNAMIC_COLLECTIONS
});

Cloudlets.putPolicyVersionBody = putPolicyVersionBody;

module.exports = Cloudlets;
