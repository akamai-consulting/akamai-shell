'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'tools/record-tool/bin/record-tool.js');

function temporaryFile(content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'record-tool-'));
  const file = path.join(directory, 'saved.jsonl');
  fs.writeFileSync(file, content);
  return { directory, file };
}

test('create-script generates a signed-request script from JSONL', () => {
  const { directory, file } = temporaryFile(`${JSON.stringify({
    sequence: 4,
    request: {
      method: 'get',
      path: '/papi/v1/properties',
      headers: { Accept: 'application/json', Authorization: '[REDACTED]' },
      qs: { contractId: 'ctr_1' }
    },
    response: { statusCode: 200, body: { properties: [] } }
  })}\n`);
  const result = spawnSync(process.execPath, [cli, 'create-script', '-f', file], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /new EdgeGrid/);
  assert.match(result.stdout, /"method": "GET"/);
  assert.match(result.stdout, /"contractId": "ctr_1"/);
  assert.doesNotMatch(result.stdout, /"Authorization"/);
  assert.match(result.stdout, /"expectedStatusCode": 200/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('create-script omits redacted body fields and supports output files', () => {
  const { directory, file } = temporaryFile(JSON.stringify({
    request: {
      method: 'POST',
      path: '/cloudlets/v3/policies',
      headers: {},
      qs: {},
      body: { name: 'demo', token: '[REDACTED]' }
    },
    response: { statusCode: 201 }
  }));
  const output = path.join(directory, 'generated.js');
  const result = spawnSync(process.execPath, [
    cli, 'create-script', '-f', file, '-o', output
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const script = fs.readFileSync(output, 'utf8');
  assert.match(script, /"name": "demo"/);
  assert.doesNotMatch(script, /"token"/);
  assert.match(script, /omitted redacted value/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('create-script reports malformed JSONL with its line number', () => {
  const { directory, file } = temporaryFile(
    '{"request":{"method":"GET","path":"/health","headers":{},"qs":{}}}\nnot-json\n'
  );
  const result = spawnSync(process.execPath, [cli, 'create-script', '-f', file], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /line 2: invalid JSON/);
  fs.rmSync(directory, { recursive: true, force: true });
});
