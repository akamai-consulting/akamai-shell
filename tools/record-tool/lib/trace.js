'use strict';

const fs = require('node:fs');

const REDACTED = '[REDACTED]';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitize(value, warnings, location) {
  if (value === REDACTED) {
    warnings.push(`omitted redacted value at ${location}`);
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const sanitized = sanitize(item, warnings, `${location}[${index}]`);
      return sanitized === undefined ? null : sanitized;
    });
  }
  if (!isObject(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const sanitized = sanitize(item, warnings, `${location}.${key}`);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function validateRecord(record, lineNumber) {
  if (!isObject(record)) throw new Error(`line ${lineNumber}: record must be a JSON object`);
  if (!isObject(record.request)) {
    throw new Error(`line ${lineNumber}: request must be an object`);
  }
  const { method, path } = record.request;
  if (typeof method !== 'string' || !/^[A-Za-z]+$/.test(method)) {
    throw new Error(`line ${lineNumber}: request.method must be an HTTP method`);
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    throw new Error(`line ${lineNumber}: request.path must be an absolute API path`);
  }
  for (const field of ['headers', 'qs']) {
    if (record.request[field] !== undefined && !isObject(record.request[field])) {
      throw new Error(`line ${lineNumber}: request.${field} must be an object`);
    }
  }
  return {
    ...record,
    request: { ...record.request, method: method.toUpperCase() }
  };
}

function readTrace(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${filePath}: ${error.message}`);
  }
  const records = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`line ${index + 1}: invalid JSON: ${error.message}`);
    }
    records.push(validateRecord(record, index + 1));
  }
  if (records.length === 0) throw new Error(`${filePath}: trace contains no records`);
  return records;
}

function prepareRequest(request, warnings, index) {
  const headers = sanitize(request.headers || {}, warnings, `record ${index} headers`);
  const qs = sanitize(request.qs || {}, warnings, `record ${index} query`);
  const prepared = {
    method: request.method,
    path: request.path,
    headers,
    qs
  };
  if (request.body !== undefined) {
    const body = sanitize(request.body, warnings, `record ${index} body`);
    if (body !== undefined) prepared.body = body;
  }
  return prepared;
}

module.exports = { readTrace, prepareRequest, REDACTED };
