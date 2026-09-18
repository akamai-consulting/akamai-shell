# Project Status

## Current state

- Project: `akamai-shell`, an interactive JavaScript-enabled Akamai API
  shell for direct, generic HTTP access through EdgeGrid.
- Active branch: `main`.
- The current implementation is on `main`; local documentation and unrelated
  worktree artifacts may still differ from the remote branch.
- Runtime: Node.js CommonJS; `src/main.js` is the executable entry point.
- Current validation before documentation-only changes: 363 Node.js tests pass.
- `ref/akamai-apis` is the checked-in OpenAPI source submodule. The other
  supplied `ref/` directories are reference repositories and must not be
  edited or accidentally staged.

The tracked worktree is up to date with `origin/main`. Local untracked
reference directories and other local artifacts may be present; they are not
project changes.

## Supported API surface

API modules are discovered automatically from `src/apis/*.js`. The repository
currently contains modules for Property Manager, Cloudlets v2/v3, Edge
Diagnostics, Edge DNS, DataStream Config, and many additional Akamai services
including AppSec, CCU, EdgeWorkers, EdgeKV, GTM, Identity Management, Network
Lists, Reporting, Script Management, SIEM, SLA, Storage, Test Management, and
others.

GET operations are generally available for paths declared by each module's
OpenAPI metadata. POST and PUT support is method- and module-specific:

- Edge Diagnostics supports its declared POST operations.
- Cloudlets v2/v3 support their declared policy and policy-version writes.
- Property Manager supports property-version creation and declared rule-tree
  PUT operations.
- Other modules expose only the methods declared by their modules.

Unsupported method/path combinations fail explicitly. Activation,
deactivation, PATCH, DELETE, and broader mutation workflows remain
unsupported unless a module explicitly declares them.

## Completed capabilities

### Requests, configuration, and persistence

- Direct EdgeGrid-authenticated requests through a generic transport.
- Configurable `.edgerc` path, credential section, account switch key, and
  target context.
- Shared `accountSwitchKey`, `contractId`, and `groupId` defaults under
  `config.target`, with compatibility aliases.
- HTTPie-style request arguments: `name==value` for query parameters,
  `name=value` for string body fields, and `name:=value` for JSON body fields.
- `-f <file>` writes formatted GET responses or loads a POST/PUT JSON body.
  Inline fields override fields loaded from a file.
- `-v <expression>` supplies an initial POST/PUT object body; inline fields
  merge over it.
- Meaningful HTTP status, transport, authentication, and API failures are
  preserved and reported.
- Persistent history, environment variables, configuration, and restrictive
  file permissions under `~/.config/akamai-shell/`. The executable
  `startup.js` file is loaded at startup and `state.js` is loaded as persisted
  session state when present.
- Credential secrets and sensitive request values are redacted from output,
  logs, and recordings.

### Interactive shell and JavaScript

Supported commands include `get`, `post`, `put`, `find`, `show`, `history`,
`echo`, `record`, `help`, `exit`, and `quit`, plus local shell commands with
`!`.

- JavaScript assignment, expressions, arrays, objects, properties, indices,
  deletion, functions, and console methods are supported in the session.
- `$()` uses the shared command parser and dispatcher, rather than a
  command-specific allowlist. It can invoke API commands and ordinary shell
  commands; commands without a meaningful result return `undefined`.
- `$()` supports nested command pipelines and indexed/property access such as
  `$('find ...')[0].path`.
- String variables expand correctly in API paths without introducing literal
  JSON quotes. For example, a path returned by `find` can be reused with
  `get $path`.
- Output-producing commands support local pipelines, including:
  `record show --http | head -5`, `history | head`, and `help | less`.
- `find` performs one collection GET and returns matching dictionaries and
  resource paths; it does not recursively fetch child resources.
- Ctrl+R provides reverse incremental history search.
- A semicolon-terminated JavaScript statement suppresses its displayed result.
- Script files support shebang execution, positional arguments through
  `process.argv`, multi-line JavaScript statements, and non-zero failure
  status. Interactive input remains available when no script file is supplied.

### Recording

- `record on` retains all redacted in-memory request records for the session.
- `record off` disables recording.
- `record auto` remains active and keeps exactly one record: the most recently
  completed request, including a failed request.
- `record show` and `record show --http` display the current buffer and can be
  piped to local shell commands.
- Assigning `config.recordMode` synchronizes the live recorder.

### Completion

- API modules are discovered independently and provide method-aware routing
  and completion metadata.
- Static API paths, methods, intermediate paths, and OpenAPI parameters are
  derived from checked-in documents.
- Dynamic identifiers such as properties, versions, edge hostnames, CP
  codes, groups, contracts, zones, policies, streams, and other module-
  specific values can be fetched and cached through authenticated GETs.
- Completion lookup failures and empty candidate sets remain silent.
- Completion works when the API path contains a variable. For example:
  `p0 = "/papi/v1"` followed by `get $p0/prop<TAB>` preserves `$p0` in the
  inserted candidate.
- Operation-specific write fields are completed with the correct syntax:
  body fields use `:=`, while query parameters use `==`. For example,
  Property Manager version creation offers `createFromVersion:=`.
- Parameter help resolves variable-based API paths while retaining the
  original command text.
- `?` contextual help works at API argument positions without changing the
  input buffer; quoted question marks remain literal.

## Recent discussion outcomes

### Shared command dispatch

The project previously had separate handling for commands inside `$()`.
That was changed experimentally and then merged into `main`: nested commands
now use the same parser and dispatcher as top-level commands. This keeps
variable expansion, pipelines, API routing, and error behavior consistent.

### Variable expansion and completion

The tokenizer originally reinserted JSON-quoted string values after
tokenization, causing paths such as `get $pp` to become URL-encoded quotes.
Request commands now use raw string token values. Completion separately
resolves variables without mutating them and restores the original variable
reference in inserted candidates.

### Pipeline behavior

Pipeline support was expanded beyond API responses and `echo`/`show`.
Output-producing commands now share one pipeline path, including `help`,
`history`, and `record show`.

## Known limitations and not done

- Tab completion does not cover every dynamic identifier or every contextual
  API field; each module must declare its metadata or dynamic descriptor.
- Query/body validation is metadata-assisted but not a complete generated
  client type system.
- Pagination and automatic following of API page links are not implemented.
- Some dynamic completion lookup failures intentionally produce no candidates
  rather than detailed diagnostics.
- Ambiguous paths follow module precedence; there is no user-facing API
  selection syntax.
- PATCH, DELETE, activation, deactivation, and confirmation workflows remain
  out of scope.
- The JavaScript session exposes CommonJS `require`, but does not provide ES
  module `import` syntax as a shell command.
- Live Akamai requests require valid local EdgeGrid credentials. Credentials
  and secret-bearing responses must never be committed.

## Validation

Run the complete suite with:

```bash
npm test
```

Start the interactive shell with:

```bash
npm start
```

The current baseline is 363 passing tests. Targeted tests live under `test/`;
new module work should include routing, method support, completion, and
response-shape coverage without requiring live credentials.

## Important files

- `src/main.js` - executable CLI entry point.
- `src/backend.js` - persistent Node.js evaluation, commands, variables,
  pipelines, persistence, recording, and request dispatch.
- `src/client.js` - readline input, history, completion, contextual help, and
  communication with the backend.
- `src/edgegrid-transport.js` - generic method-aware EdgeGrid transport.
- `src/api-registry.js` - module discovery, routing, metadata, and completion
  fan-out.
- `src/api-module.js` - shared API-module adapter.
- `src/openapi-catalog.js` - OpenAPI metadata loader.
- `src/path-completion.js` - shared static and dynamic completion helpers.
- `src/apis/` - independently registered API modules.
- `src/recorder.js` - redacted in-memory request recording.
- `test/` - unit and regression tests.
- `README.md` - installation, command reference, and usage examples.
- `AGENTS.md` - project requirements and design guidance.
- `doc/skill/ttyrec-demo/SKILL.md` - guidance for creating ttyrec-based
  animated terminal demos.
