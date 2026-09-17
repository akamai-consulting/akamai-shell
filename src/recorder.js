'use strict';

const { redact } = require('./logger');

function json(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function formatHttp(record) {
  const request = record.request;
  const query = new URLSearchParams(request.qs || {}).toString();
  const target = query ? `${request.path}?${query}` : request.path;
  const requestHeaders = Object.entries(redact(request.headers || {}))
    .map(([name, value]) => `${name}: ${value}`).join('\r\n');
  const requestBody = request.body === undefined ? '' : `\r\n\r\n${json(redact(request.body))}`;
  const response = record.response || {};
  const responseHeaders = Object.entries(redact(response.headers || {}))
    .map(([name, value]) => `${name}: ${value}`).join('\r\n');
  const responseBody = response.body === undefined ? '' : `\r\n\r\n${json(redact(response.body))}`;
  const responseMessage = `HTTP/1.1 ${response.statusCode || 0}\r\n${responseHeaders}${responseBody}`;
  return `${request.method} ${target} HTTP/1.1\r\n${requestHeaders}${requestBody}\r\n\r\n${responseMessage}`;
}

function createRecorder() {
  const records = [];
  let mode = 'off';
  let sequence = 0;

  return {
    get mode() { return mode; },
    setMode(nextMode) {
      if (!['auto', 'on', 'off'].includes(nextMode)) {
        throw new Error('Record mode must be auto, on, or off');
      }
      if (nextMode === 'auto' && mode !== 'auto') records.length = 0;
      mode = nextMode;
    },
    begin(request) {
      if (mode === 'off') return null;
      return {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        request: redact(request),
        startedAt: Date.now()
      };
    },
    complete(entry, response, error) {
      if (!entry) return;
      if (response) entry.response = redact(response);
      if (error) entry.error = redact({
        statusCode: error.statusCode,
        message: error.message,
        body: error.body
      });
      entry.durationMs = Date.now() - entry.startedAt;
      delete entry.startedAt;
      if (mode === 'auto') records.length = 0;
      records.push(entry);
    },
    jsonl() {
      return records.map(json).join('\n');
    },
    http() {
      return records.map(formatHttp).join('\n\n');
    },
    clear() {
      records.length = 0;
      sequence = 0;
    },
    records
  };
}

module.exports = { createRecorder };
