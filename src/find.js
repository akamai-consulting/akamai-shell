'use strict';

const apiRegistry = require('./api-registry');

function parseMatchRule(rule) {
  const match = String(rule || '').match(/^(~?)([^=]*)=(~?)(.*)$/);
  if (!match || (!match[2] && !match[1]) || (!match[4] && match[3] === '~') ||
      (match[1] === '~' && match[3] !== '~')) {
    throw new Error('Invalid find query. Use field=value, field=~value, ~field=~value, or ~=~value');
  }
  const [, fieldMarker, field, valueMarker, value] = match;
  return {
    field,
    fieldSubstring: fieldMarker === '~',
    value,
    valueSubstring: valueMarker === '~'
  };
}

function stringValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function matchesRule(resource, rule) {
  const fields = [];
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [name, fieldValue] of Object.entries(value)) {
      fields.push([name, fieldValue]);
      visit(fieldValue);
    }
  }
  visit(resource);
  return fields.some(([name, fieldValue]) => {
    const fieldMatches = rule.fieldSubstring
      ? name.includes(rule.field)
      : name === rule.field;
    const candidate = stringValue(fieldValue);
    return fieldMatches &&
      (rule.valueSubstring ? candidate.includes(rule.value) : candidate === rule.value);
  });
}

function collectionItems(body) {
  if (Array.isArray(body)) return body.filter((item) => item && typeof item === 'object');
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.items)) return body.items;
  for (const value of Object.values(body)) {
    if (value && typeof value === 'object' && Array.isArray(value.items)) {
      return value.items;
    }
  }
  return [];
}

function splitPath(value) {
  return value.split('/').filter(Boolean);
}

function templatePrefixMatches(template, concrete) {
  const templateParts = splitPath(template);
  const concreteParts = splitPath(concrete);
  return templateParts.length >= concreteParts.length &&
    concreteParts.every((part, index) => {
      const expected = templateParts[index];
      return expected.startsWith('{') || expected === part;
    });
}

function itemValue(item, parameter) {
  if (!item || typeof item !== 'object') return undefined;
  if (item[parameter] !== undefined) return item[parameter];
  const withoutSuffix = parameter.replace(/Id$/, '');
  return item[withoutSuffix] !== undefined ? item[withoutSuffix] : undefined;
}

function itemPath(catalog, node, item) {
  const currentParts = splitPath(node.template);
  const operation = catalog.operations
    .filter((candidate) => candidate.method === 'GET')
    .filter((candidate) => splitPath(candidate.path).length === currentParts.length + 1)
    .find((candidate) => {
      if (!templatePrefixMatches(candidate.path, node.template)) return false;
      const next = splitPath(candidate.path)[currentParts.length];
      return next.startsWith('{') && itemValue(item, next.slice(1, -1)) !== undefined;
    });
  if (!operation) return node.path;
  return `/${splitPath(operation.path).map((part) => {
    if (!part.startsWith('{')) return part;
    return String(itemValue(item, part.slice(1, -1)));
  }).join('/')}`;
}

async function findResources(settings, rootPath, query, requestGet) {
  const rule = parseMatchRule(query);
  const module = apiRegistry.moduleForMethod('GET', rootPath);
  const catalog = apiRegistry.catalogForPrefix(module.prefix);
  if (!catalog) throw new Error(`No OpenAPI catalog is available for "${module.prefix}"`);
  const relativeRoot = rootPath === module.prefix
    ? '/' : rootPath.slice(module.prefix.length);
  const response = await apiRegistry.get(settings, rootPath, {}, requestGet);
  const items = collectionItems(response.body);
  const node = { path: relativeRoot, template: relativeRoot };
  const results = [];
  const seen = new Set();

  function addMatch(resource, path) {
    if (!matchesRule(resource, rule)) return;
    const key = `${path}|${JSON.stringify(resource)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ path, resource });
  }

  if (items.length) {
    for (const item of items) {
      addMatch(item, `${module.prefix}${itemPath(catalog, node, item)}`);
    }
  } else if (response.body && typeof response.body === 'object') {
    addMatch(response.body, rootPath);
  }
  return results;
}

module.exports = { parseMatchRule, matchesRule, findResources };
