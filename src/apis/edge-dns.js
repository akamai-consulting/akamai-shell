'use strict';

const { createApiModule } = require('../api-module');

const PREFIX = '/config-dns/v2';
const QUERY_PARAMETERS = [
  'accountSwitchKey', 'contractIds', 'gid', 'search', 'sortBy',
  'subzoneGrants', 'types', 'page', 'pageSize', 'showAll', 'activationStates',
  'dnsSecStatus', 'transferStatus', 'isComplete', 'isExpired', 'proxyId',
  'filterMode', 'zone', 'from', 'to', 'name', 'nameserver'
];
const GET_PATHS = [
  '/changelists',
  '/changelists/{zone}',
  '/changelists/{zone}/diff',
  '/changelists/{zone}/names',
  '/changelists/{zone}/names/{name}/types',
  '/changelists/{zone}/names/{name}/types/{type}',
  '/changelists/{zone}/recordsets',
  '/changelists/{zone}/settings',
  '/data/authorities',
  '/data/contracts',
  '/data/dns-sec-algorithms',
  '/data/edgehostnames',
  '/data/groups',
  '/data/recordset-types',
  '/data/tsig-algorithms',
  '/keys',
  '/proxies',
  '/proxies/healthcheck-recordset-types',
  '/proxies/{proxyId}',
  '/proxies/{proxyId}/zones',
  '/proxies/{proxyId}/zones/create-requests',
  '/proxies/{proxyId}/zones/create-requests/{requestId}',
  '/proxies/{proxyId}/zones/create-requests/{requestId}/result',
  '/proxies/{proxyId}/zones/delete-requests/results',
  '/proxies/{proxyId}/zones/delete-requests/{requestId}',
  '/proxies/{proxyId}/zones/delete-requests/{requestId}/result',
  '/proxies/{proxyId}/zones/keys',
  '/proxies/{proxyId}/zones/{name}',
  '/proxies/{proxyId}/zones/{name}/key',
  '/proxies/{proxyId}/zones/{name}/key/used-by',
  '/proxies/{proxyId}/zones/{name}/manual-filter-names',
  '/zones',
  '/zones/convert-requests',
  '/zones/convert-requests/{requestId}',
  '/zones/convert-requests/{requestId}/result',
  '/zones/create-requests/{requestId}',
  '/zones/create-requests/{requestId}/result',
  '/zones/delete-requests/{requestId}',
  '/zones/delete-requests/{requestId}/result',
  '/zones/{zone}',
  '/zones/{zone}/aliases',
  '/zones/{zone}/contract',
  '/zones/{zone}/dnskeys',
  '/zones/{zone}/key',
  '/zones/{zone}/key/used-by',
  '/zones/{zone}/matching-ds-record-key-tags',
  '/zones/{zone}/names',
  '/zones/{zone}/names/{name}/types',
  '/zones/{zone}/names/{name}/types/{type}',
  '/zones/{zone}/recordsets',
  '/zones/{zone}/versions',
  '/zones/{zone}/versions/diff',
  '/zones/{zone}/versions/{uuid}',
  '/zones/{zone}/versions/{uuid}/recordsets',
  '/zones/{zone}/versions/{uuid}/zone-file',
  '/zones/{zone}/zone-file'
];
const STATIC_PATHS = [...new Set(GET_PATHS.flatMap((endpoint) => {
  const parts = endpoint.split('/').filter(Boolean);
  return [
    endpoint,
    ...Array.from({ length: parts.length - 1 }, (_, index) =>
      `/${parts.slice(0, index + 1).join('/')}`)
  ];
}))];
const DYNAMIC_COLLECTIONS = [
  {
    matches: /^\/zones\/[^/]*$/,
    collection: '/zones',
    prefix: '/zones/',
    response: (body) => body && Array.isArray(body.zones) ? body.zones : [],
    key: 'zone'
  },
  {
    matches: /^\/proxies\/[^/]*$/,
    collection: '/proxies',
    prefix: '/proxies/',
    response: (body) => body && Array.isArray(body.items) ? body.items : [],
    key: 'proxyId'
  },
  {
    matches: /^\/proxies\/[^/]+\/zones\/[^/]*$/,
    collection: (input) => input.split('/').slice(0, 4).join('/'),
    prefix: (input) => `${input.split('/').slice(0, 4).join('/')}/`,
    response: (body) => body && Array.isArray(body.proxyZones) ? body.proxyZones : [],
    key: 'name'
  }
];

module.exports = createApiModule({
  name: 'EdgeDns',
  prefix: PREFIX,
  queryParameters: QUERY_PARAMETERS,
  staticPaths: STATIC_PATHS,
  dynamicCollections: DYNAMIC_COLLECTIONS,
  combineStaticCandidates: true
});
