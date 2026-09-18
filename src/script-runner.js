'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const { createRepl } = require('./repl');

// Scripts may start with a shebang such as `#!/usr/bin/env akamai-shell`.
// It is not shell command syntax, so it is dropped before execution.
function stripShebang(content) {
  if (!content.startsWith('#!')) return content;
  const newlineIndex = content.indexOf('\n');
  return newlineIndex === -1 ? '' : content.slice(newlineIndex + 1);
}

async function runScript(filePath, { output = process.stdout, errorOutput = process.stderr } = {}) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    errorOutput.write(`Error: Unable to read script file "${filePath}": ${error.message}\n`);
    return 1;
  }
  const lines = stripShebang(content).split('\n');

  // The REPL is created against throwaway streams so that its prompt and
  // internal writes do not appear in the script's actual output, and so
  // that history/environment persistence does not touch the real user
  // configuration files used by interactive sessions.
  const replInput = new PassThrough();
  const replOutput = new PassThrough();
  replOutput.resume();
  const scratchDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-script-'));
  const historyFile = path.join(scratchDirectory, 'history');
  const repl = createRepl(replOutput, replInput, undefined, historyFile);

  let exitCode = 0;
  try {
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      let keepGoing;
      try {
        keepGoing = await repl.execute(line, { output });
      } catch (error) {
        errorOutput.write(`Error: ${error.message}\n`);
        exitCode = 1;
        break;
      }
      if (!keepGoing) break;
    }
  } finally {
    repl.rl.close();
    replInput.destroy();
    replOutput.destroy();
    fs.rmSync(scratchDirectory, { recursive: true, force: true });
  }
  return exitCode;
}

module.exports = { runScript, stripShebang };
