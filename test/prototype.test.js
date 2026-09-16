'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createRepl,
  parseQuery,
  parseGetArguments,
  parseWriteArguments,
  QUERY_PARAMETER_CANDIDATES,
  COMMANDS,
  tokenize,
  splitPipeline,
  formatHistory,
  findHistoryMatch,
  loadHistory,
  saveHistory,
  loadParameterDefaults,
  saveParameterDefaults,
  settingCandidates,
  contextCandidates,
  formatParameterHelp,
  addCompletionSeparator
} = require('../src/repl');
const apiRegistry = require('../src/api-registry');
const { collectionFor, dynamicCandidates, pathCandidates } = require('../src/catalog');

test('parses a PAPI path and query parameters', () => {
  assert.deepEqual(parseQuery('/properties?limit=2&accountSwitchKey=a%3Ab'), {
    path: '/properties',
    query: { limit: '2', accountSwitchKey: 'a:b' }
  });

  test('sets and completes the session log level with info fallback', async () => {
    const output = new PassThrough();
    const input = new PassThrough();
    const repl = createRepl(output, input, undefined, path.join(os.tmpdir(), `history-${Date.now()}`));

    await repl.execute('set log-level debug');
    assert.equal(repl.settings.logLevel, 'debug');
    await repl.execute('set log-level invalid');
    assert.equal(repl.settings.logLevel, 'info');
    assert.deepEqual(await repl.complete('set log-level '), [['debug', 'info', 'warn', 'error'], '']);
  });
});

test('parses HTTPie-style query arguments', () => {
  assert.deepEqual(parseGetArguments(['/products', 'contractId==ctr_123', 'limit==10']), {
    path: '/products',
    query: { contractId: 'ctr_123', limit: '10' }
  });

  test('parses HTTPie-style JSON write body arguments', () => {
    assert.deepEqual(parseWriteArguments([
      '/edge-diagnostics/v1/curl?accountSwitchKey=acct',
      'url=https://example.test',
      'timeout:=30',
      'enabled:=true',
      'headers:={"x-test":["one","two"]}',
      'message=left==right',
      'includeBody==true'
    ], 'POST'), {
      path: '/edge-diagnostics/v1/curl',
      query: { accountSwitchKey: 'acct', includeBody: 'true' },
      body: {
        url: 'https://example.test',
        timeout: 30,
        enabled: true,
        headers: { 'x-test': ['one', 'two'] },
        message: 'left==right'
      }
    });
    assert.throws(() => parseWriteArguments(['/curl'], 'PUT'), /PUT requires at least one body/);
    assert.throws(() => parseWriteArguments(['/curl', 'enabled:=maybe']), /Invalid JSON body value/);
  });
});

test('completes HTTPie-style query parameter names', () => {
  assert(QUERY_PARAMETER_CANDIDATES.includes('contractId=='));
  assert(QUERY_PARAMETER_CANDIDATES.includes('groupId=='));
});

test('supports string body fields with key=value for PUT', () => {
  assert.deepEqual(parseWriteArguments([
    '/cloudlets/v3/policies/371861/versions/1',
    'description=test',
    'matchRules:=[]'
  ], 'PUT'), {
    path: '/cloudlets/v3/policies/371861/versions/1',
    query: {},
    body: {
      description: 'test',
      matchRules: []
    }
  });
});

test('evaluates JavaScript variables and passes JSON bodies with -v', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-javascript-'));
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath, query, body, method) => {
    requests.push({ requestPath, query, body, method });
    return { body: { accepted: true } };
  }, path.join(directory, 'history'));

  await repl.execute('foo = {"aaa":[1,2,3]}');
  await repl.execute('foo["bbb"] = 1234');
  await repl.execute('delete foo["aaa"]');
  await repl.execute('post -v foo /edge-diagnostics/v1/curl');

  assert.deepEqual(requests[0], {
    requestPath: '/curl',
    query: {},
    body: { bbb: 1234 },
    method: 'POST'
  });
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('calls Akamai get commands through the JavaScript $ function', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-javascript-command-'));
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath, query) => {
    requests.push({ requestPath, query });
    return { body: { version: 1, description: 'test' } };
  }, path.join(directory, 'history'));

  output.read();
  await repl.execute('pid = 371982');
  output.read();
  await repl.execute('foo = $("get /cloudlets/api/v2/policies/$pid/versions/1")');
  output.read();
  assert.deepEqual(JSON.parse(JSON.stringify(repl.variables.foo)), {
    version: 1,
    description: 'test'
  });
  assert.deepEqual(requests, [{
    requestPath: '/policies/371982/versions/1',
    query: {}
  }]);
  assert.equal(output.read(), null);

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('adds a separator only after a complete completion candidate', () => {
  assert.deepEqual(addCompletionSeparator([['/properties'], '/prop']), [
    ['/properties '], '/prop'
  ]);
  for (const path of ['/papi/v1', '/edgeworkers/v1', '/cloudlets/v3', '/ccu/v3']) {
    assert.deepEqual(addCompletionSeparator([[path], path]), [[path], path]);
  }
  assert.deepEqual(addCompletionSeparator([['/papi/v1'], '/pap']), [
    ['/papi/v1'], '/pap'
  ]);
  assert.deepEqual(addCompletionSeparator([
    ['/papi/v1/properties/prp_1047813'], '/papi/v1/properties/prp_1047'
  ]), [
    ['/papi/v1/properties/prp_1047813'], '/papi/v1/properties/prp_1047'
  ]);
  assert.deepEqual(addCompletionSeparator([
    ['/papi/v1/properties'], '/papi/v1/prope'
  ]), [
    ['/papi/v1/properties'], '/papi/v1/prope'
  ]);
  for (const [candidate, partial] of [
    ['/edgeworkers/v1', '/edgew'],
    ['/cloudlets/v3/policies', '/cloudlets/v3/pol'],
    ['/ccu/v3/delete', '/ccu/v3/del']
  ]) {
    assert.deepEqual(addCompletionSeparator([[candidate], partial]), [
      [candidate], partial
    ]);
  }
  assert.deepEqual(addCompletionSeparator([['/properties/'], '/properties']), [
    ['/properties/'], '/properties'
  ]);
  assert.deepEqual(addCompletionSeparator([['contractId=='], 'contract']), [
    ['contractId=='], 'contract'
  ]);
  const variables = { foo: { activations: [{ id: 1 }] } };
  assert.deepEqual(addCompletionSeparator(
    [['foo["activations"]'], 'foo["activatio'],
    variables
  ), [['foo["activations"]'], 'foo["activatio']);
  assert.deepEqual(addCompletionSeparator(
    [['foo["activations"][0]["id"]'], 'foo["activations"][0]["i'],
    variables
  ), [['foo["activations"][0]["id"] '], 'foo["activations"][0]["i']);
});

test('formats OpenAPI parameter help for list and detail contexts', () => {
  const parameters = apiRegistry.parameterHelp('GET', '/papi/v1/properties');
  const listHelp = formatParameterHelp('GET', '/papi/v1/properties', parameters);
  assert.match(listHelp, /contractId/);
  assert.match(listHelp, /required/);
  assert.match(listHelp, /Unique identifier for the contract/);

  const detailHelp = formatParameterHelp(
    'GET',
    '/papi/v1/properties',
    apiRegistry.parameterHelp('GET', '/papi/v1/properties', 'contractId'),
    'contractId'
  );
  assert.match(detailHelp, /Type: string/);
  assert.match(detailHelp, /Usage: get \/papi\/v1\/properties contractId==ctr_1-1TJZFW/);

  const jsonHelp = formatParameterHelp(
    'POST',
    '/papi/v1/properties',
    apiRegistry.parameterHelp('GET', '/papi/v1/properties', 'contractId'),
    'contractId',
    ':='
  );
  assert.match(jsonHelp, /contractId:="ctr_1-1TJZFW"/);

  const ccuHelp = formatParameterHelp(
    'POST',
    '/ccu/v3',
    apiRegistry.parameterHelp('POST', '/ccu/v3')
  );
  assert.match(ccuHelp, /network/);
  assert.match(ccuHelp, /objects/);
});

test('completes command names', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-command-completion-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  assert.deepEqual(await repl.complete('po'), [['post'], 'po']);
  assert(COMMANDS.includes('put'));
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('completes JavaScript object keys and array indices', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-javascript-completion-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  await repl.execute('foo = {"aaa":[10,20],"bbb":"hoge"}');
  assert.deepEqual(await repl.complete('foo['), [
    ['foo["aaa"]', 'foo["bbb"]'],
    'foo['
  ]);
  assert.deepEqual(await repl.complete('foo["aaa"]'), [
    ['foo["aaa"][0]', 'foo["aaa"][1]'],
    'foo["aaa"]'
  ]);
  assert.deepEqual(await repl.complete('foo["aaa"]['), [
    ['foo["aaa"][0]', 'foo["aaa"][1]'],
    'foo["aaa"]['
  ]);

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('supports the question-mark help alias and JavaScript fallback', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-command-errors-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));
  output.read();

  await repl.execute('?');
  const help = output.read().toString();
  assert.match(help, /Commands:/);

  await repl.execute('foo = []');
  output.read();
  await repl.execute('[1,2,3].forEach(v => foo.push(v))');
  assert.equal(JSON.stringify(repl.variables.foo), '[1,2,3]');
  await repl.execute('foo');
  assert.equal(output.read().toString(), '[1,2,3]\n');
  await repl.execute('console.log(123)');
  assert.equal(output.read().toString(), '123\n');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('completes the file option for API commands', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-option-completion-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  assert.deepEqual(await repl.complete('post -'), [['-f'], '-']);
  const [rootCandidates, rootPartial] = await repl.complete('post ');
  assert.equal(rootPartial, '/');
  assert(rootCandidates.includes('/papi/v1/properties'));
  assert(rootCandidates.includes('/edge-diagnostics/v1/curl'));
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('completes partial API prefixes for API resource commands', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-prefix-completion-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  for (const command of ['get', 'post', 'put']) {
    assert.deepEqual(await repl.complete(`${command} /edge`), [
      ['/edge-diagnostics/v1', '/edgekv/v1', '/edgeworkers/v1'],
      '/edge'
    ]);
  }
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('completes partial resource paths for write commands', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-resource-completion-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  assert.deepEqual(await repl.complete('post /edge-diagnostics/v1/err'), [
    ['/edge-diagnostics/v1/error-translator'],
    '/edge-diagnostics/v1/err'
  ]);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('stays silent when a write path has no completion candidates', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-empty-completion-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  assert.deepEqual(await repl.complete('post foo'), [[], 'foo']);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('stays silent when readline completion has no candidates', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-completion-message-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));
  output.read();

  await new Promise((resolve, reject) => {
    repl.rl.completer('get /asd', (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      assert.deepEqual(result, [[], '/asd']);
      resolve();
    });
  });
  assert.equal(output.read(), null);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('reads POST bodies from a file and writes GET responses to a file', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-file-option-'));
  const historyPath = path.join(directory, 'history');
  const bodyPath = path.join(directory, 'body.json');
  const responsePath = path.join(directory, 'response.json');
  fs.writeFileSync(bodyPath, '{"url":"https://example.test","enabled":true}');
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath, query, body, method) => {
    requests.push({ requestPath, query, body, method });
    return { body: { accepted: true } };
  }, historyPath);

  await repl.execute(`post -f ${bodyPath} /edge-diagnostics/v1/curl`);
  await repl.execute(`get /edge-diagnostics/v1/edge-locations -f ${responsePath}`);
  assert.deepEqual(requests[0], {
    requestPath: '/curl',
    query: {},
    body: { url: 'https://example.test', enabled: true },
    method: 'POST'
  });
  assert.equal(fs.readFileSync(responsePath, 'utf8'), '{\n  "accepted": true\n}\n');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('reads Cloudlets PUT bodies from a file', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-cloudlets-put-'));
  const historyPath = path.join(directory, 'history');
  const bodyPath = path.join(directory, 'rcc.json');
  fs.writeFileSync(bodyPath, '{"matchRules":[{"name":"example"}]}');
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath, query, body, method) => {
    requests.push({ requestPath, query, body, method });
    return { body: { accepted: true } };
  }, historyPath);

  await repl.execute(`put -f ${bodyPath} /cloudlets/v3/policies/371861/versions/1`);
  assert.deepEqual(requests, [{
    requestPath: '/policies/371861/versions/1',
    query: {},
    body: { matchRules: [{ name: 'example' }] },
    method: 'PUT'
  }]);

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('preserves HTTPie-style Cloudlets policy version POST arguments', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-cloudlets-post-'));
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath, query, body, method) => {
    requests.push({ requestPath, query, body, method });
    return { body: { accepted: true } };
  }, path.join(directory, 'history'));

  await repl.execute('post /cloudlets/v3/policies/371861/versions policyId:=371861 matchRules:=[] description=test');
  assert.deepEqual(requests, [{
    requestPath: '/policies/371861/versions',
    query: {},
    body: { policyId: 371861, matchRules: [], description: 'test' },
    method: 'POST'
  }]);

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('keeps quoted JSON arrays typed for Cloudlets v2 POST bodies', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-cloudlets-v2-post-'));
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath, query, body, method) => {
    requests.push({ requestPath, query, body, method });
    return { body: { accepted: true } };
  }, path.join(directory, 'history'));

  await repl.execute(
    "post /cloudlets/api/v2/policies/371982/versions " +
    "policyId:=371982 description=test matchRules:='[]' matchRulesFormat=1.0"
  );
  assert.deepEqual(requests[0], {
    requestPath: '/policies/371982/versions',
    query: {},
    body: {
      policyId: 371982,
      description: 'test',
      matchRules: [],
      matchRulesFormat: '1.0'
    },
    method: 'POST'
  });

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('tokenizes quoted shell values', () => {
  assert.deepEqual(tokenize('set edgerc "~/.edgerc"'), ['set', 'edgerc', '~/.edgerc']);
});

test('completes dynamic edge hostname identifiers', () => {
  assert.deepEqual(dynamicCandidates('/edgehostnames/ehn_', {
    edgeHostnames: {
      items: [
        { edgeHostnameId: 'ehn_1', edgeHostnameDomain: 'one.example' },
        { edgeHostnameId: 'other' }
      ]
    }
  }), ['ehn_1']);
});

test('completes CP code identifiers from the CP code collection', () => {
  const input = '/cpcodes/cpc_';
  const collection = collectionFor(input);
  assert.equal(collection.collection, '/cpcodes');
  assert.deepEqual(dynamicCandidates(input, {
    cpcodes: { items: [{ cpcodeId: 'cpc_123' }, { cpcodeId: 'other' }] }
  }), ['cpc_123']);
});

test('completes property versions from the property version collection', () => {
  const input = '/properties/prp_123/versions/';
  const collection = collectionFor(input);
  assert.equal(collection.collection(input), '/properties/prp_123/versions');
  assert.deepEqual(dynamicCandidates(input, {
    versions: { items: [{ propertyVersion: 3 }, { propertyVersion: 2 }] }
  }), ['2', '3']);
});

test('provides static PAPI path candidates', () => {
  assert(pathCandidates('/properties').includes('/properties'));
});

test('completes a partial static path segment', () => {
  assert.deepEqual(pathCandidates('/cp'), ['/cpcodes']);
});

test('lists additional read-only PAPI resource paths', () => {
  assert(pathCandidates('/includes').includes('/includes'));
  assert(pathCandidates('/custom-behaviors').includes('/custom-behaviors'));
  assert(pathCandidates('/rule-formats').includes('/rule-formats'));
  assert(pathCandidates('/bulk/').includes('/bulk/activations'));
});

test('resolves nested paths after a dynamic property ID', () => {
  assert.deepEqual(
    pathCandidates('/properties/prp_615111/'),
    [
      '/properties/prp_615111/activations',
      '/properties/prp_615111/hostname-activations',
      '/properties/prp_615111/hostnames',
      '/properties/prp_615111/versions'
    ]
  );
});

test('provides set command setting candidates', () => {
  assert.deepEqual(settingCandidates(''), [
    'account-switch-key',
    'contract-id',
    'edgerc',
    'edgerc-section',
    'group-id',
    'log-level',
    'log-output'
  ]);
  assert.deepEqual(settingCandidates('edgerc-'), ['edgerc-section']);
  assert.deepEqual(settingCandidates('account'), ['account-switch-key']);
  assert.deepEqual(settingCandidates('contract'), ['contract-id']);
});

test('completes contract and group IDs from collection responses', () => {
  assert.deepEqual(contextCandidates('contract-id', {
    contracts: { items: [{ contractId: 'ctr_one' }, { contractId: 'ctr_two' }] }
  }, 'ctr_t'), ['ctr_two']);
  assert.deepEqual(contextCandidates('group-id', {
    groups: { items: [{ groupId: 'grp_one' }, { groupId: 'grp_two' }] }
  }, 'grp_'), ['grp_one', 'grp_two']);
});

test('splits a get command from a shell pipeline', () => {
  assert.deepEqual(splitPipeline("get /groups | jq '.groups.items'"), [
    'get /groups',
    "jq '.groups.items'"
  ]);
  assert.deepEqual(splitPipeline("get '/groups|not-a-pipe'"), [
    "get '/groups|not-a-pipe'",
    null
  ]);
});

test('runs local shell commands with !', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-command-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  await repl.execute('! printf "hello\\n"');
  assert.equal(output.read().toString(), 'prompt> hello\n');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('formats command history with oldest entries first', () => {
  assert.equal(formatHistory(['show', 'get /groups']), '1  get /groups\n2  show');
});

test('finds reverse history matches from newest to oldest', () => {
  const history = ['get /properties', 'get /groups', 'get /properties?limit=2'];
  assert.deepEqual(findHistoryMatch(history, 'get /properties'), {
    command: 'get /properties',
    index: 0
  });
  assert.deepEqual(findHistoryMatch(history, 'get /properties', 1), {
    command: 'get /properties?limit=2',
    index: 2
  });
});

test('does not crash when a pipeline command closes stdin early', async () => {
  const output = new PassThrough();
  let result = '';
  output.on('data', (chunk) => {
    result += chunk.toString();
  });
  const { runShellCommand } = require('../src/repl');
  await runShellCommand('head -n 1', `${'line\n'.repeat(100000)}`, output);
  assert.equal(result, 'line\n');
  output.destroy();
});

test('persists history in chronological file order', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-history-'));
  const filePath = path.join(directory, 'history');
  saveHistory(filePath, ['show', 'get /groups']);
  assert.equal(fs.readFileSync(filePath, 'utf8'), 'get /groups\nshow\n');
  assert.deepEqual(loadHistory(filePath), ['show', 'get /groups']);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('defines, expands, lists, and unsets custom variables', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });
  const repl = createRepl(output, input, undefined, historyPath);

  await repl.execute('set foo bar baz');
  await repl.execute('echo $foo');
  assert.match(printed, /"bar baz"\n/);
  printed = '';
  await repl.execute('set');
  assert.match(printed, /"foo": "bar baz"/);
  await repl.execute('unset foo');
  printed = '';
  await repl.execute('echo $foo');
  assert.equal(printed, '\n');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('expands indexed JavaScript variable values in command lines', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });
  const repl = createRepl(output, input, undefined, historyPath);
  printed = '';

  await repl.execute('foo = {"aaa":[1,2,3],"bbb":"hoge"}');
  printed = '';
  await repl.execute('echo $foo["aaa"]');
  assert.equal(printed, '[1,2,3]\n');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('loads an empty history when the history file does not exist', () => {
  const filePath = path.join(os.tmpdir(), `akamai-shell-history-${process.pid}-missing`);
  assert.deepEqual(loadHistory(filePath), []);
});

test('persists parameter defaults separately from history', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-env-'));
  const filePath = path.join(directory, 'env');
  const defaults = { contractId: 'ctr_123', groupId: 'grp_456', limit: '10' };
  saveParameterDefaults(filePath, defaults);
  assert.deepEqual(loadParameterDefaults(filePath), defaults);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('saves and loads parameter defaults through commands', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-env-command-'));
  const historyPath = path.join(directory, 'history');
  const envPath = path.join(directory, 'saved-env');
  const repl = createRepl(output, input, undefined, historyPath);

  await repl.execute('set edgerc /tmp/custom-edgerc');
  await repl.execute('set contractId ctr_command');
  await repl.execute('set foo saved-value');
  await repl.execute('set edgerc-section papi');
  await repl.execute(`save -f ${envPath}`);
  await repl.execute('set contractId ctr_changed');
  await repl.execute('set edgerc-section changed');
  await repl.execute('unset foo');
  await repl.execute(`load -f ${envPath}`);
  assert.equal(repl.settings.contractId, 'ctr_command');
  assert.equal(repl.settings.edgerc, '/tmp/custom-edgerc');
  assert.equal(repl.settings.edgercSection, 'papi');
  assert.equal(repl.settings.parameterDefaults.contractId, 'ctr_command');
  assert.equal(repl.settings.parameterDefaults.edgerc, '/tmp/custom-edgerc');
  assert.equal(repl.settings.parameterDefaults.edgercSection, 'papi');
  assert.equal(repl.variables.foo, 'saved-value');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('loads the saved EdgeGrid section when starting a new shell', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-env-start-'));
  const historyPath = path.join(directory, 'history');
  const input = new PassThrough();
  const output = new PassThrough();
  const first = createRepl(output, input, undefined, historyPath);
  await first.execute('set foo startup-value');
  await first.execute('set edgerc-section papi');
  first.rl.close();
  input.destroy();
  output.destroy();

  const nextInput = new PassThrough();
  const nextOutput = new PassThrough();
  const second = createRepl(nextOutput, nextInput, undefined, historyPath);
  assert.equal(second.settings.edgercSection, 'papi');
  assert.equal(second.variables.foo, 'startup-value');
  second.rl.close();
  nextInput.destroy();
  nextOutput.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('unset -a clears all API parameter defaults', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-unset-all-'));
  const repl = createRepl(output, input, undefined, path.join(directory, 'history'));

  await repl.execute('set contractId ctr_command');
  await repl.execute('set groupId grp_command');
  await repl.execute('set limit 10');
  await repl.execute('set foo bar');
  const savedDefaults = fs.readFileSync(path.join(directory, 'env'), 'utf8');
  await repl.execute('unset -a');

  assert.equal(repl.settings.contractId, '');
  assert.equal(repl.settings.groupId, '');
  assert.deepEqual(repl.settings.parameterDefaults, {});
  assert.equal(fs.readFileSync(path.join(directory, 'env'), 'utf8'), savedDefaults);
  await repl.execute('echo $foo');

  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('completes edge hostname IDs from the edge hostname collection', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  const requests = [];
  const repl = createRepl(output, input, async (settings, path) => {
    requests.push({ settings, path });
    return {
      body: {
        edgeHostnames: {
          items: [
            { edgeHostnameId: 'ehn_123' },
            { edgeHostnameId: 'ehn_456' }
          ]
        }
      }
    };
  }, historyPath);

  const result = await repl.complete('get /papi/v1/edgehostnames/ehn_');
  assert.deepEqual(result, [
    ['/papi/v1/edgehostnames/ehn_123', '/papi/v1/edgehostnames/ehn_456'],
    '/papi/v1/edgehostnames/ehn_'
  ]);
  assert.equal(requests[0].path, '/edgehostnames');
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('completes property IDs from the property collection without exposing templates', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath) => {
    requests.push(requestPath);
    return {
      body: {
        properties: {
          items: [
            { propertyId: 'prp_123' },
            { propertyId: 'prp_456' }
          ]
        }
      }
    };
  }, historyPath);

  const result = await repl.complete('get /papi/v1/properties/');
  assert.deepEqual(result, [
    ['/papi/v1/properties/prp_123', '/papi/v1/properties/prp_456'],
    '/papi/v1/properties/'
  ]);
  assert.deepEqual(requests, ['/properties']);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('completes hostnames from the hostname collection', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  const repl = createRepl(output, input, async () => ({
    body: {
      hostnames: {
        items: [{ cnameFrom: 'www.example.com' }]
      }
    }
  }), historyPath);

  const result = await repl.complete('get /papi/v1/hostnames/');
  assert.deepEqual(result, [['/papi/v1/hostnames/www.example.com'], '/papi/v1/hostnames/']);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('includes Cloudlets paths in root completion', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const repl = createRepl(output, input, undefined, path.join(historyDirectory, 'history'));

  const [candidates, partial] = await repl.complete('get /');
  assert.equal(partial, '/');
  assert(candidates.includes('/papi/v1'));
  assert(candidates.includes('/cloudlets/v3'));
  assert(candidates.includes('/edge-diagnostics/v1'));
  assert(candidates.includes('/config-dns/v2'));
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('completes Cloudlets v3 policy versions from the version collection', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const historyPath = path.join(historyDirectory, 'history');
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath) => {
    requests.push(requestPath);
    return {
      body: {
        content: [{ version: 1 }, { version: 3 }]
      }
    };
  }, historyPath);

  const result = await repl.complete('get /cloudlets/v3/policies/371861/versions/');
  assert.deepEqual(result, [
    [
      '/cloudlets/v3/policies/371861/versions/1',
      '/cloudlets/v3/policies/371861/versions/3'
    ],
    '/cloudlets/v3/policies/371861/versions/'
  ]);
  assert.deepEqual(requests, ['/policies/371861/versions']);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('completes Cloudlets v3 policy IDs from the policy collection', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const requests = [];
  const repl = createRepl(output, input, async (settings, requestPath) => {
    requests.push(requestPath);
    return {
      body: {
        content: [{ id: 371861 }, { id: 482902 }]
      }
    };
  }, path.join(historyDirectory, 'history'));

  const result = await repl.complete('get /cloudlets/v3/policies/');
  assert.deepEqual(result, [
    [
      '/cloudlets/v3/policies/371861',
      '/cloudlets/v3/policies/482902'
    ],
    '/cloudlets/v3/policies/'
  ]);
  assert.deepEqual(requests, ['/policies']);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('shows Edge Diagnostics GET endpoint groups after its API prefix', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const repl = createRepl(output, input, undefined, path.join(historyDirectory, 'history'));

  const [candidates, partial] = await repl.complete('get /edge-diagnostics/v1/');
  assert.equal(partial, '/edge-diagnostics/v1/');
  assert(candidates.includes('/edge-diagnostics/v1/edge-locations'));
  assert(candidates.includes('/edge-diagnostics/v1/grep'));
  assert(candidates.includes('/edge-diagnostics/v1/user-diagnostic-data'));
  assert(candidates.includes('/edge-diagnostics/v1/connectivity-problems'));
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('completes Edge DNS zones from the zones collection', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const repl = createRepl(output, input, async (settings, requestPath) => {
    assert.equal(requestPath, '/zones');
    return { body: { zones: [{ zone: 'example.com' }, { zone: 'example.net' }] } };
  }, path.join(historyDirectory, 'history'));

  const result = await repl.complete('get /config-dns/v2/zones/');
  assert.deepEqual(result, [
    [
      '/config-dns/v2/zones/convert-requests',
      '/config-dns/v2/zones/create-requests',
      '/config-dns/v2/zones/delete-requests',
      '/config-dns/v2/zones/example.com',
      '/config-dns/v2/zones/example.net'
    ],
    '/config-dns/v2/zones/'
  ]);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});

test('does not expose synthetic descendants while completing an Edge DNS zone', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const historyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'akamai-shell-test-'));
  const repl = createRepl(output, input, async () => ({
    body: { zones: [{ zone: 'cdn.nicedemo.net' }] }
  }), path.join(historyDirectory, 'history'));

  const result = await repl.complete('get /config-dns/v2/zones/cdn.ni');
  assert.deepEqual(result, [
    ['/config-dns/v2/zones/cdn.nicedemo.net'],
    '/config-dns/v2/zones/cdn.ni'
  ]);
  repl.rl.close();
  input.destroy();
  output.destroy();
  fs.rmSync(historyDirectory, { recursive: true, force: true });
});
