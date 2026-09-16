# Project Status

## Current state

- Project: `akamai-shell`, an interactive Akamai API shell with method-aware
  JSON write support.
- Active branch: `main`.
- Latest commit: `ea12988 Add project README`.
- `ref/akamai-apis` is a git submodule at the pinned OpenAPI source revision;
  other supplied `ref/` directories remain unrelated embedded repositories.
- Runtime: Node.js CommonJS with `akamai-edgegrid@4.0.4`.

## Supported API modules

- Property Manager: `/papi/v1`
- Cloudlets v3: `/cloudlets/v3`
- Cloudlets v2: `/cloudlets/api/v2`
- Edge Diagnostics v1: `/edge-diagnostics/v1`
- Edge DNS / Config DNS v2: `/config-dns/v2`
- DataStream Config API v2: `/datastream-config-api/v2`

GET remains available for operations declared by each module's OpenAPI
document. Edge Diagnostics v1 supports its OpenAPI-derived POST operations.
Cloudlets v3 supports its OpenAPI-derived PUT policy and policy-version
operations, including normalization of fetched policy-version responses into
PUT-compatible bodies, and POST policy-version creation.
Cloudlets v2 supports its OpenAPI-derived POST policy-version operations.
Property Manager supports creating property versions with POST and its
OpenAPI-derived PUT rule-tree operations. POST, PUT parsing, routing, and
Unsupported method/path combinations fail explicitly. Activation/deactivation
and mutation confirmation flows remain unsupported.

## Completed capabilities

### Requests and authentication

- Direct HTTP request construction with EdgeGrid authentication.
- Configurable `.edgerc` path and credential section.
- Generic response parsing and HTTP/API error reporting.
- Target `accountSwitchKey` propagation across API modules.
- PAPI target context (`accountSwitchKey`, `contractId`, and `groupId`) defaults
  and validation, grouped under the persisted `config.target` object.
- HTTPie-style inline query parameters, with inline values overriding
  configured defaults.

### Interactive shell

Supported commands include `get`, `post`, `put`, `find`, `show`, `history`,
`echo`, `record`, `help`, `exit`, and `quit`.

- Shell variables support `$name`, property, and index expansion (for example
  `$foo["items"][0]`). API command arguments are tokenized before variable
  expansion, so quoted JSON values remain intact in commands such as
  `put -v "$foo" /papi/v1/...`.
- Runtime configuration is available as the reserved `config` object from
  JavaScript and command interpolation. The complete PAPI target context is
  grouped under `config.target`. Legacy flat aliases remain available for
  compatibility. User-defined variables remain top-level and are not merged
  into `config`.
- Lines that are not recognized as shell commands are evaluated as JavaScript,
  allowing snippets such as `[1,2,3].forEach(v => console.log(v))`; shell
  commands retain precedence. JavaScript `console.log`, `info`, `warn`, and
  `error` write to the REPL output.
- JavaScript can call the experimental asynchronous `$` helper with
  `await $('get /api/path')`; it returns the decoded response body without
  printing the nested command output. It can also capture local shell output
  with `$(! cat file.json)`, parsing JSON when possible. JavaScript
  expressions with a non-undefined outermost result print that value as JSON;
  `console.log` output is not duplicated.
- The experimental JavaScript session scope accepts trusted statements such as
  `foo = {"items":[]}`, `foo["name"] = "value"`, and `delete foo["items"]`.
  POST and PUT also accept `-v <expression>` to use a JSON-serializable session
  value as the complete request body; `-v` cannot be combined with `-f`.
- `post` and `put` accept HTTPie-like JSON body fields: `name=value` creates a
  string and `name:=value` parses JSON. Query parameters remain available in
  the path or as `name==value` arguments. Writes require a body and do not
  support GET pipelines.
- `find <api-path> -q <rule>` fetches one GET response and returns matching
  dictionaries and resource paths. Rules support exact or substring matching
  for field names and values; it does not recursively fetch child resources.
- `get`, `post`, and `put` accept `-f <path>` before or after the API path.
  GET writes formatted response JSON to the file; POST and PUT read a JSON
  request body from the file.
- Local shell commands can be run with `! <command>`.
- GET and `echo` output support local shell pipelines.
- Ctrl+R starts reverse incremental history search; repeated Ctrl+R searches
  older matches.
- History and environment state use persistent paths under
  `~/.config/akamai-shell/` with restrictive permissions.
- Credential secrets are never persisted or displayed.
- Session tracing is controlled with `config.logLevel` and `config.logOutput`;
  debug traces include redacted HTTP request and response details. The
  `config` object also persists `edgerc`, `edgercSection`, account context,
  query defaults, and `recordMode`.
- Minimal Script Developer Mode is available with `record auto|on|off`,
  `record show`, and `record show --http`; captures are in-memory, redacted
  JSONL records for the current session.

### Modular completion architecture

- API modules are discovered automatically from `src/apis/*.js`.
- API-qualified paths are required for normal requests and completion.
- The shared module adapter in `src/api-module.js` centralizes API prefix
  routing, relative-path conversion, method-aware dispatch, method metadata,
  and candidate restoration.
- Registered modules must provide `supports`, `supportsMethod`, `get`,
  `dispatch`, and `complete`; method-specific endpoint metadata controls
  writes and method-aware completion.
- Shared completion helpers centralize static matching, dynamic collection
  lookup, response extraction, filtering, cache keys, and cached requests.
- Dynamic descriptors use consistent names: `matches`, `collection`, `prefix`,
  `response`, and `key`.
- Partial dynamic identifiers only produce matching real values; descendant
  paths appear after the identifier is complete.
- Edge DNS combines static operation candidates with dynamic zone/proxy
  candidates.
- PAPI completion covers contracts, groups, properties, versions, edge
  hostnames, CP codes, products, includes, activations, hostnames, custom
  behaviors, and custom overrides.
- Cloudlets v3 policy and policy-version completion is supported.
- Edge DNS zone, proxy, and proxy-zone completion is supported.
- DataStream group and stream identifier completion is supported.
- OpenAPI operation metadata is loaded by `src/openapi-catalog.js`; dynamic
  identifiers and API-specific contextual validation remain local to modules.

## Tests and validation

The project has 318 passing Node.js tests covering GET and write request
construction, method routing, API-qualified completion, dynamic identifiers,
persistence, JavaScript evaluation, token-aware variable expansion,
pipelines, shell commands, recording, and reverse history behavior.

Run:

```bash
npm test
npm start
```

## Known limitations

- Static operation paths, methods, intermediate completion paths, and query
  parameter names are derived from the checked-in `akamai-apis` OpenAPI JSON
  documents. Dynamic completion descriptors and PAPI contextual validation
  remain local API-module behavior.
- Completion does not cover every dynamic identifier or every
  operation-specific query parameter.
- Query-parameter validation is partial rather than generated from OpenAPI
  operation metadata.
- Pagination and automatic following of API page links are not implemented.
- Ambiguous GET paths use module precedence; there is no user-facing API
  selection syntax.
- Some completion lookup failures return no dynamic candidates rather than
  exposing detailed lookup diagnostics.
- External Node.js module loading through `require` or `import` is not exposed
  to the JavaScript session.

## Important files

- `src/main.js` - executable entry point.
- `src/repl.js` - shell commands, history, variables, pipelines, persistence,
  readline completion, and reverse search behavior.
- `src/api-registry.js` - module discovery, routing, completion fan-out, and
  query metadata aggregation.
- `src/api-module.js` - shared API-module adapter.
- `src/openapi-catalog.js` - OpenAPI JSON loader and metadata extractor.
- `src/path-completion.js` - shared path and dynamic completion helpers.
- `src/edgegrid-transport.js` - generic method-aware EdgeGrid request and
  response transport.
- `src/papi-client.js` - PAPI-specific transport behavior.
- `src/catalog.js` - PAPI OpenAPI catalog adapter and dynamic descriptors.
- `src/apis/` - API-specific modules.
- `test/` - unit and regression tests.
- `README.md` - installation, command reference, JavaScript examples, and
  interactive usage guide.
- `AGENTS.md` - project requirements and design guidance.
