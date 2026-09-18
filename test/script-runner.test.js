'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runScript, stripShebang } = require('../src/script-runner');

test('strips a leading shebang line before execution', () => {
  assert.equal(stripShebang('#!/usr/bin/env akamai-shell\nval = 1\n'), 'val = 1\n');
  assert.equal(stripShebang('val = 1\n'), 'val = 1\n');
  assert.equal(stripShebang('#!/usr/bin/env akamai-shell'), '');
});

test('runs a shebang script assigning a variable and echoing it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-'));
  const scriptFile = path.join(directory, 'script.sh');
  fs.writeFileSync(scriptFile, '#!/usr/bin/env akamai-shell\nval = 123\necho $val\n');
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let captured = '';
  output.on('data', (chunk) => { captured += chunk.toString(); });

  const exitCode = await runScript(scriptFile, { output, errorOutput });

  assert.equal(exitCode, 0);
  assert.equal(captured, '123\n123\n');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('reports a non-zero exit status when a script command fails', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-fail-'));
  const scriptFile = path.join(directory, 'script.sh');
  fs.writeFileSync(scriptFile, '#!/usr/bin/env akamai-shell\nthis is not valid js or a command(\n');
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let capturedError = '';
  errorOutput.on('data', (chunk) => { capturedError += chunk.toString(); });

  const exitCode = await runScript(scriptFile, { output, errorOutput });

  assert.equal(exitCode, 1);
  assert.match(capturedError, /Error:/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('returns a non-zero exit status when the script file cannot be read', async () => {
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let capturedError = '';
  errorOutput.on('data', (chunk) => { capturedError += chunk.toString(); });

  const exitCode = await runScript('/nonexistent/script.sh', { output, errorOutput });

  assert.equal(exitCode, 1);
  assert.match(capturedError, /Unable to read script file/);
});

test('does not create any scratch files or directories while running a script', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-scratch-'));
  try {
    const scriptFile = path.join(directory, 'script.sh');
    fs.writeFileSync(scriptFile, '#!/usr/bin/env akamai-shell\nval = 123\necho $val\n');
    const output = new PassThrough();
    const errorOutput = new PassThrough();
    output.resume();
    errorOutput.resume();

    await runScript(scriptFile, { output, errorOutput });

    // Only the fixture directory created above should exist; the script runner
    // itself must not create additional scratch directories or files, even
    // when other tests concurrently create unrelated temporary directories.
    const scriptScratchEntries = fs.readdirSync(os.tmpdir())
      .filter((name) => name !== path.basename(directory) && /^akamai-shell-script/.test(name));
    assert.deepEqual(scriptScratchEntries, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('loads the saved config and variables at startup without writing them back', async () => {
  // Point os.homedir() at a fixture HOME for this isolated test process so the
  // real interactive-session environment file is never touched. Modules that
  // resolve the environment file path at load time must be required after
  // HOME is set.
  const originalHome = process.env.HOME;
  const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-home-'));
  process.env.HOME = homeDirectory;
  const envDirectory = path.join(homeDirectory, '.config', 'akamai-shell');
  fs.mkdirSync(envDirectory, { recursive: true });
  const envFile = path.join(envDirectory, 'env');
  const savedEnvironment = {
    parameters: { edgercSection: 'papi' },
    variables: { pid: 526230 }
  };
  fs.writeFileSync(envFile, `${JSON.stringify(savedEnvironment, null, 2)}\n`);
  const before = fs.statSync(envFile).mtimeMs;

  delete require.cache[require.resolve('../src/repl')];
  delete require.cache[require.resolve('../src/script-runner')];
  const { runScript: runIsolatedScript } = require('../src/script-runner');

  try {
    const scriptFile = path.join(homeDirectory, 'script.sh');
    fs.writeFileSync(scriptFile, '#!/usr/bin/env akamai-shell\necho $pid\necho $config.edgercSection\n');
    const output = new PassThrough();
    const errorOutput = new PassThrough();
    let captured = '';
    output.on('data', (chunk) => { captured += chunk.toString(); });

    const exitCode = await runIsolatedScript(scriptFile, { output, errorOutput });

    assert.equal(exitCode, 0);
    assert.equal(captured, '526230\n"papi"\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(envFile, 'utf8')), savedEnvironment);
    assert.equal(fs.statSync(envFile).mtimeMs, before);
  } finally {
    process.env.HOME = originalHome;
    delete require.cache[require.resolve('../src/repl')];
    delete require.cache[require.resolve('../src/script-runner')];
    fs.rmSync(homeDirectory, { recursive: true, force: true });
  }
});
