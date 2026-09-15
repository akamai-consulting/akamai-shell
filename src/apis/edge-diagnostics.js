'use strict';

const { createApiModule } = require('../api-module');

const PREFIX = '/edge-diagnostics/v1';
const QUERY_PARAMETERS = [
  'accountSwitchKey', 'includeContentResponseBody', 'edgeIp', 'cpCode',
  'clientIp', 'objectStatus', 'httpStatusCode', 'userAgent', 'arl', 'start',
  'end', 'logType', 'includeCurl', 'includeDig', 'includeMtr'
];
const STATIC_PATHS = [
  '/connectivity-problems',
  '/connectivity-problems/requests/{requestId}',
  '/content-problems',
  '/content-problems/requests/{requestId}',
  '/edge-locations',
  '/error-translator',
  '/error-translator/requests/{requestId}',
  '/grep',
  '/grep/requests/{requestId}',
  '/gtm',
  '/gtm/{property}',
  '/gtm/gtm-properties',
  '/gtm/{property}/{domain}/gtm-property-ips',
  '/ipa',
  '/ipa/hostnames',
  '/metadata-tracer',
  '/metadata-tracer/locations',
  '/metadata-tracer/requests/{requestId}',
  '/url-health-check',
  '/url-health-check/requests/{requestId}',
  '/user-diagnostic-data',
  '/user-diagnostic-data/groups',
  '/user-diagnostic-data/groups/{groupId}/records'
];

module.exports = createApiModule({
  name: 'EdgeDiagnostics',
  prefix: PREFIX,
  queryParameters: QUERY_PARAMETERS,
  staticPaths: STATIC_PATHS
});
