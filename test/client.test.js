'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { PassThrough } = require('node:stream');
const { BackendClient, runInteractive, runScript } = require('../src/client');

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

test('closes the frontend when the backend exits cleanly', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyFile = `/tmp/akamai-shell-client-${process.pid}.history`;
  try {
    const run = runInteractive({ input, output, historyFile });
    input.end('if (true) { process.exit(0) }\n');
    await run;
  } finally {
    fs.rmSync(historyFile, { force: true });
  }
});

test('stops a script cleanly when the backend exits with status zero', async () => {
  const scriptFile = `/tmp/akamai-shell-client-${process.pid}.as`;
  const output = new PassThrough();
  try {
    fs.writeFileSync(scriptFile, "console.log('this should show')\nprocess.exit(0)\necho should not reach here\n");
    const exitCode = await runScript(scriptFile, [], { output });
    assert.equal(exitCode, 0);
    assert.match(output.read()?.toString() || '', /this should show/);
  } finally {
    fs.rmSync(scriptFile, { force: true });
  }
});

test('suppresses script evaluation results unless config.verbose is true', async () => {
  const scriptFile = `/tmp/akamai-shell-client-${process.pid}.as`;
  const output = new PassThrough();
  try {
    fs.writeFileSync(scriptFile, 'foo = 123\nshow foo\nconfig.verbose = true;\nbar = 456\n');
    const chunks = [];
    output.on('data', (chunk) => chunks.push(chunk.toString()));
    const exitCode = await runScript(scriptFile, [], { output });
    assert.equal(exitCode, 0);
    assert.equal(chunks.join(''), '123\n456\n');
  } finally {
    fs.rmSync(scriptFile, { force: true });
  }
});
