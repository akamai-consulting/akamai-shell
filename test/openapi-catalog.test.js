'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
  loadOpenApiCatalog
} = require('../src/openapi-catalog');

test('extracts methods, intermediate paths, and query parameters from OpenAPI JSON', () => {
  const catalog = loadOpenApiCatalog({
    filePath: path.join(__dirname, 'fixtures', 'openapi-catalog.json')
  });

  assert.deepEqual(catalog.methodPaths.GET, ['/widgets/{widgetId}']);
  assert.deepEqual(catalog.methodPaths.POST, ['/widgets/{widgetId}']);
  assert(catalog.methodStaticPaths.GET.includes('/widgets'));
  assert(catalog.methodStaticPaths.GET.includes('/widgets/{widgetId}'));
  assert.deepEqual(catalog.methodQueryParameters.GET, ['accountSwitchKey', 'limit']);
  assert.deepEqual(catalog.methodQueryParameters.POST, ['accountSwitchKey', 'mode']);
  assert.deepEqual(catalog.queryParameters, ['accountSwitchKey', 'limit', 'mode']);
});

test('loads the checked-in Edge Diagnostics document as the static source', () => {
  const catalog = loadOpenApiCatalog({ service: 'edge-diagnostics/v1' });

  assert(catalog.methodPaths.GET.includes('/edge-locations'));
  assert(catalog.methodPaths.POST.includes('/curl'));
  assert(catalog.methodStaticPaths.POST.includes('/esi-debugger-api'));
  assert(catalog.queryParameters.includes('includeContentResponseBody'));
});

test('exposes OpenAPI-derived metadata through API modules', () => {
  const edgeDiagnostics = require('../src/apis/edge-diagnostics');
  const propertyManager = require('../src/apis/property-manager');

  assert(edgeDiagnostics.methodPaths.GET.includes('/edge-locations'));
  assert(edgeDiagnostics.methodPaths.POST.includes('/curl'));
  assert(propertyManager.methodPaths.GET.includes('/properties/{propertyId}'));
  assert(propertyManager.staticPaths.includes('/properties/{propertyId}/versions'));
  assert(propertyManager.queryParameters.includes('contractId'));
});

test('reports missing OpenAPI documents instead of inventing metadata', () => {
  assert.throws(
    () => loadOpenApiCatalog({ filePath: path.join(__dirname, 'fixtures', 'missing.json') }),
    /Unable to load OpenAPI document/
  );
});
