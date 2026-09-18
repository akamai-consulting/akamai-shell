'use strict';

const fs = require('fs');
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

// Determines whether `source` (one or more joined script lines) forms a
// balanced, complete statement: every bracket/brace/paren is closed, no
// string or block comment is left open. This allows a JavaScript construct
// such as a `for`/`if` block or a multi-line object/array literal to span
// several script lines while still executing as a single statement.
function isStatementComplete(source) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
  }
  return depth <= 0 && !quote && !blockComment;
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
