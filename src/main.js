#!/usr/bin/env node
'use strict';

const { createRepl } = require('./repl');
const { runScript } = require('./script-runner');

const args = process.argv.slice(2);
// Supports `akamai-shell script-file` directly, including invocation through a
// `#!/usr/bin/env akamai-shell` shebang line, which passes the script path as
// the sole argument.
const scriptFile = args[0] && !args[0].startsWith('-') ? args[0] : undefined;

if (scriptFile) {
  runScript(scriptFile).then((exitCode) => {
    process.exitCode = exitCode;
  });
} else {
  createRepl();
}
