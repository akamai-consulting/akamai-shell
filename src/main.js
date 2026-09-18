#!/usr/bin/env node
'use strict';

const { runInteractive, runScript } = require('./client');

const args = process.argv.slice(2);
// Supports `akamai-shell script-file` directly, including invocation through a
// `#!/usr/bin/env akamai-shell` shebang line, which passes the script path as
// the sole argument.
const scriptFile = args[0] && !args[0].startsWith('-') ? args[0] : undefined;

if (scriptFile) {
  const handleBrokenPipe = (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    else process.nextTick(() => { throw error; });
  };
  process.stdout.on('error', handleBrokenPipe);
  process.stderr.on('error', handleBrokenPipe);
  runScript(scriptFile, args.slice(1)).then((exitCode) => {
    process.exitCode = exitCode;
  });
} else {
  runInteractive().catch((error) => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
