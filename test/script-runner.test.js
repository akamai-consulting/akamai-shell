'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runScript, stripShebang, isStatementComplete } = require('../src/script-runner');

test('strips a leading shebang line before execution', () => {
  assert.equal(stripShebang('#!/usr/bin/env akamai-shell\nval = 1\n'), 'val = 1\n');
  assert.equal(stripShebang('val = 1\n'), 'val = 1\n');
  assert.equal(stripShebang('#!/usr/bin/env akamai-shell'), '');
});

test('detects whether a script statement is balanced/complete', () => {
  assert.equal(isStatementComplete('val = 1'), true);
  assert.equal(isStatementComplete('for (let i = 0; i < 3; i++) {'), false);
  assert.equal(isStatementComplete('for (let i = 0; i < 3; i++) {\n  data[i] = i\n}'), true);
  assert.equal(isStatementComplete('foo = "unterminated'), false);
  assert.equal(isStatementComplete('foo = "//not a comment"'), true);
  assert.equal(isStatementComplete('foo = 1 // } trailing comment {'), true);
  assert.equal(isStatementComplete('foo = /* { */ 1'), true);
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

test('executes a multi-line for loop as a single statement', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-multiline-'));
  const scriptFile = path.join(directory, 'script.sh');
  fs.writeFileSync(scriptFile, [
    '#!/usr/bin/env akamai-shell',
    'data = []',
    'for (let i = 0; i < 3; i++) {',
    '  data[i] = i * i',
    '}',
    'show data'
  ].join('\n'));
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let captured = '';
  output.on('data', (chunk) => { captured += chunk.toString(); });

  const exitCode = await runScript(scriptFile, { output, errorOutput });

  assert.equal(exitCode, 0);
  assert.equal(captured, '[]\n[\n  0,\n  1,\n  4\n]\n');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('reports an error for a script ending inside an unterminated statement', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-unterminated-'));
  const scriptFile = path.join(directory, 'script.sh');
  fs.writeFileSync(scriptFile, [
    '#!/usr/bin/env akamai-shell',
    'echo before',
    'for (let i = 0; i < 3; i++) {',
    '  echo $i'
  ].join('\n'));
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  output.resume();
  let capturedError = '';
  errorOutput.on('data', (chunk) => { capturedError += chunk.toString(); });

  const exitCode = await runScript(scriptFile, { output, errorOutput });

  assert.equal(exitCode, 1);
  assert.match(capturedError, /unterminated statement/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('exposes process and a require scoped to the script\'s own directory', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-require-'));
  fs.writeFileSync(path.join(directory, 'helper.js'), 'module.exports = { greet: () => "hi from helper" };');
  const scriptFile = path.join(directory, 'script.sh');
  fs.writeFileSync(scriptFile, [
    '#!/usr/bin/env akamai-shell',
    'helper = require("./helper")',
    'show helper.greet()',
    'show process.argv[1]'
  ].join('\n'));
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let captured = '';
  output.on('data', (chunk) => { captured += chunk.toString(); });

  const exitCode = await runScript(scriptFile, { output, errorOutput });

  assert.equal(exitCode, 0);
  assert.equal(captured,
    `{}\n"hi from helper"\n${JSON.stringify(scriptFile)}\n`);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('passes command-line arguments through process.argv', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-test-argv-'));
  const scriptFile = path.join(directory, 'script.sh');
  fs.writeFileSync(scriptFile, [
    '#!/usr/bin/env akamai-shell',
    'console.log(process.argv)',
    'show require("process").argv[2]',
    'show require("process").argv[3]'
  ].join('\n'));
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const originalArgv = process.argv;
  let captured = '';
  output.on('data', (chunk) => { captured += chunk.toString(); });

  const exitCode = await runScript(scriptFile, {
    output,
    errorOutput,
    scriptArgs: ['foo', 'bar']
  });

  assert.equal(exitCode, 0);
  assert.match(captured, /foo/);
  assert.match(captured, /bar/);
  assert.match(captured, /"foo"\n"bar"\n/);
  assert.deepEqual(process.argv, originalArgv);
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
