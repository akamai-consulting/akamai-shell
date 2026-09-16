'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, redact } = require('../src/logger');

test('uses info as the default log level and filters lower-priority messages', () => {
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  const logger = createLogger(output);

  logger.debug('hidden');
  logger.info('visible');

  assert.equal(text, '[INFO] visible\n');
});

test('redacts sensitive values in nested HTTP trace data', () => {
  assert.deepEqual(redact({
    headers: { Authorization: 'secret', Accept: 'application/json' },
    body: { token: 'secret', value: 'visible' }
  }), {
    headers: { Authorization: '[REDACTED]', Accept: 'application/json' },
    body: { token: '[REDACTED]', value: 'visible' }
  });

  test('switches logging to a file', async () => {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-log-')), 'session.log');
    const logger = createLogger(new PassThrough());
    logger.setOutput(filePath);
    logger.info('written');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(fs.readFileSync(filePath, 'utf8'), /\[INFO\] written/);
  });
});
