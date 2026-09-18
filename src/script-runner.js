'use strict';

const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const { createRepl } = require('./repl');
const { isStatementComplete } = require('./statement-completion');

// Scripts may start with a shebang such as `#!/usr/bin/env akamai-shell`.
// It is not shell command syntax, so it is dropped before execution.
function stripShebang(content) {
  if (!content.startsWith('#!')) return content;
  const newlineIndex = content.indexOf('\n');
  return newlineIndex === -1 ? '' : content.slice(newlineIndex + 1);
}

async function runScript(filePath, {
  output = process.stdout,
  errorOutput = process.stderr,
  scriptArgs = []
} = {}) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    errorOutput.write(`Error: Unable to read script file "${filePath}": ${error.message}\n`);
    return 1;
  }
  const lines = stripShebang(content).split('\n');
  const originalArgv = process.argv;
  process.argv = [process.argv[0], path.resolve(filePath), ...scriptArgs];

  // The REPL is created against throwaway streams so that its prompt and
  // internal writes do not appear in the script's actual output. A null
  // history file puts the REPL in an ephemeral, in-memory-only mode, so no
  // scratch files or directories are created and the interactive session's
  // real history/environment files are never read or written.
  const replInput = new PassThrough();
  const replOutput = new PassThrough();
  replOutput.resume();
  const repl = createRepl(
    replOutput,
    replInput,
    undefined,
    null,
    path.dirname(path.resolve(filePath)),
    output
  );

  let exitCode = 0;
  let pendingStatement = '';
  try {
    for (const line of lines) {
      if (!pendingStatement && (!line.trim() || line.trim().startsWith('#'))) continue;
      pendingStatement = pendingStatement ? `${pendingStatement}\n${line}` : line;
      if (!isStatementComplete(pendingStatement)) continue;
      const statement = pendingStatement;
      pendingStatement = '';
      let keepGoing;
      try {
        keepGoing = await repl.execute(statement, { output });
      } catch (error) {
        errorOutput.write(`Error: ${error.message}\n`);
        exitCode = 1;
        break;
      }
      if (!keepGoing) break;
    }
    if (exitCode === 0 && pendingStatement.trim()) {
      errorOutput.write('Error: Unexpected end of script inside an unterminated statement\n');
      exitCode = 1;
    }
  } finally {
    repl.rl.close();
    replInput.destroy();
    replOutput.destroy();
    process.argv = originalArgv;
  }
  return exitCode;
}

module.exports = { runScript, stripShebang, isStatementComplete };
