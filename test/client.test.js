'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BackendClient } = require('../src/client');

test('interrupts synchronous evaluation and keeps the backend usable', async (t) => {
  const backend = new BackendClient({
    output: process.stdout,
    errorOutput: process.stderr
  });
  t.after(() => backend.close());

  await backend.initialize({ workingDirectory: process.cwd() });
  const evaluation = backend.evaluate('while (1) { ; }');
  setTimeout(() => backend.interrupt(), 100);

  await assert.rejects(evaluation, {
    message: 'Script execution was interrupted by `SIGINT`'
  });
  assert.equal(await backend.evaluate('40 + 2'), 42);
});
