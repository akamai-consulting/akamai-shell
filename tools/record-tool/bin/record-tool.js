#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { readTrace } = require('../lib/trace');
const { createScript } = require('../lib/create-script');

function usage() {
  return 'Usage: record-tool create-script -f <saved.jsonl> [-o <generated.js>]';
}

function parseCreateScript(args) {
  let input;
  let output;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '-f' || argument === '--file') input = args[++index];
    else if (argument === '-o' || argument === '--output') output = args[++index];
    else throw new Error(`unknown option: ${argument}`);
  }
  if (!input) throw new Error('an input file is required (-f <saved.jsonl>)');
  return { input, output };
}

function main(argv) {
  if (argv[0] !== 'create-script') throw new Error(usage());
  const { input, output } = parseCreateScript(argv.slice(1));
  const script = createScript(readTrace(input));
  if (output) {
    fs.writeFileSync(output, script, { encoding: 'utf8', mode: 0o600 });
  } else {
    process.stdout.write(script);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`record-tool: ${error.message}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
