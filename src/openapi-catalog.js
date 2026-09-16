'use strict';

const fs = require('fs');
const path = require('path');

const HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'
]);
const REFERENCE_ROOT = path.resolve(__dirname, '../ref/akamai-apis/apis');

function resolveReference(document, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) {
    throw new Error(`Unsupported OpenAPI reference "${reference}"`);
  }
  return reference.slice(2).split('/').reduce((value, part) => {
    if (!value || typeof value !== 'object') return undefined;
    return value[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }, document);
}

function resolveParameter(document, parameter) {
  const resolved = parameter && parameter.$ref
    ? resolveReference(document, parameter.$ref)
    : parameter;
  if (!resolved || typeof resolved !== 'object') {
    throw new Error('OpenAPI parameter reference did not resolve to an object');
  }
  if (typeof resolved.name !== 'string' || typeof resolved.in !== 'string') {
    throw new Error('OpenAPI parameter must define both name and in');
  }
  return resolved;
}

function resolveSchema(document, schema) {
  if (schema && schema.$ref) return resolveReference(document, schema.$ref);
  return schema;
}

function addPathAndAncestors(paths, endpoint) {
  const parts = endpoint.split('/').filter(Boolean);
  for (let length = 1; length <= parts.length; length += 1) {
    paths.add(`/${parts.slice(0, length).join('/')}`);
  }
}

function loadOpenApiCatalog({ service, filePath } = {}) {
  const resolvedPath = filePath || (service && path.join(
    REFERENCE_ROOT,
    service,
    'openapi.json'
  ));
  if (!resolvedPath) {
    throw new Error('An OpenAPI service or file path is required');
  }

  let document;
  try {
    document = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load OpenAPI document "${resolvedPath}": ${error.message}`, {
      cause: error
    });
  }
  if (!document || typeof document !== 'object' ||
      !document.paths || typeof document.paths !== 'object') {
    throw new Error(`OpenAPI document "${resolvedPath}" has no valid paths object`);
  }

  const methodPaths = {};
  const methodStaticPaths = {};
  const methodQueryParameters = {};
  const queryParameters = new Set();
  const operations = [];

  for (const [endpoint, pathItem] of Object.entries(document.paths)) {
    if (!endpoint.startsWith('/') || !pathItem || typeof pathItem !== 'object') {
      throw new Error(`OpenAPI document "${resolvedPath}" contains an invalid path`);
    }
    if (pathItem.parameters !== undefined && !Array.isArray(pathItem.parameters)) {
      throw new Error(`OpenAPI path parameters for "${endpoint}" are invalid`);
    }
    const pathParameters = pathItem.parameters || [];

    for (const [method, operation] of Object.entries(pathItem)) {
      const normalizedMethod = method.toUpperCase();
      if (!HTTP_METHODS.has(normalizedMethod)) continue;
      if (!operation || typeof operation !== 'object') {
        throw new Error(`OpenAPI operation ${normalizedMethod} ${endpoint} is invalid`);
      }
      if (operation.parameters !== undefined && !Array.isArray(operation.parameters)) {
        throw new Error(`OpenAPI parameters for ${normalizedMethod} ${endpoint} are invalid`);
      }

      const parameters = [
        ...pathParameters,
        ...(Array.isArray(operation.parameters) ? operation.parameters : [])
      ].map((parameter) => resolveParameter(document, parameter));
      const requestSchema = resolveSchema(document,
        operation.requestBody?.content?.['application/json']?.schema);
      const bodyParameters = requestSchema && requestSchema.properties
        ? Object.entries(requestSchema.properties).map(([name, schema]) => ({
          name,
          in: 'body',
          description: schema.description || requestSchema.description,
          required: Array.isArray(requestSchema.required) && requestSchema.required.includes(name),
          schema: resolveSchema(document, schema)
        }))
        : [];
      const queries = [...new Set(parameters
        .filter((parameter) => parameter.in === 'query' && parameter.name)
        .map((parameter) => parameter.name))];
      queries.forEach((name) => queryParameters.add(name));

      if (!methodPaths[normalizedMethod]) methodPaths[normalizedMethod] = [];
      methodPaths[normalizedMethod].push(endpoint);
      if (!methodStaticPaths[normalizedMethod]) {
        methodStaticPaths[normalizedMethod] = new Set();
      }
      addPathAndAncestors(methodStaticPaths[normalizedMethod], endpoint);
      if (!methodQueryParameters[normalizedMethod]) {
        methodQueryParameters[normalizedMethod] = new Set();
      }
      queries.forEach((name) => methodQueryParameters[normalizedMethod].add(name));
      operations.push({
        method: normalizedMethod,
        path: endpoint,
        queryParameters: queries,
        parameters: [...parameters, ...bodyParameters]
      });
    }
  }

  const staticPaths = [...new Set(Object.values(methodStaticPaths)
    .flatMap((paths) => [...paths]))];
  for (const method of Object.keys(methodStaticPaths)) {
    methodStaticPaths[method] = [...methodStaticPaths[method]];
  }
  for (const method of Object.keys(methodQueryParameters)) {
    methodQueryParameters[method] = [...methodQueryParameters[method]];
  }
  for (const method of Object.keys(methodPaths)) {
    methodPaths[method] = [...new Set(methodPaths[method])];
  }

  return {
    filePath: resolvedPath,
    methodPaths,
    staticPaths,
    methodStaticPaths,
    queryParameters: [...queryParameters],
    methodQueryParameters,
    operations
  };
}

module.exports = {
  HTTP_METHODS,
  REFERENCE_ROOT,
  resolveReference,
  loadOpenApiCatalog
};
