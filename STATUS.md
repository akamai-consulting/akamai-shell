# Project Status

## Current state

`akamai-shell` is a Node.js CommonJS interactive shell for direct Akamai API
access through EdgeGrid. The active runtime is:

```text
src/main.js -> src/client.js -> src/backend.js
```

The frontend owns readline and the terminal. A persistent backend child process
owns JavaScript state, command dispatch, API routing, completion, persistence,
and request execution. See `DESIGN.md` for the architecture and extension
boundaries; see `README.md` for installation and user-facing command usage.

Current repository state:

- Branch: `main`.
- Local `main` contains the Ctrl-C interruption merge and is ahead of
  `origin/main` by two commits.
- `DESIGN.md`, `STATUS.md`, `README.md`, and `AGENTS.md` contain the current
  documentation set.
- The full test suite passes: 372 tests.
- Existing unrelated untracked reference directories and local artifacts may
  be present. Do not stage them as project changes.

## Completed

### Runtime and scripting

- Persistent native Node.js backend communicating with the readline client
  over newline-delimited JSON.
- Interactive JavaScript evaluation with persistent variables, functions,
  CommonJS `require()`, command substitution, shell pipelines, and local shell
  escapes.
- Executable scripts with shebang support, positional `process.argv`
  arguments, script-only `#` comments, multiline statement accumulation, and
  non-zero failure status.
- `startup.js`, executable JavaScript state files, `save`, and `load`.
- Tilde expansion and completion for `load` and `save` paths.
- Empty interactive input immediately returns to a fresh prompt.

### API access

- Generic EdgeGrid-authenticated HTTP transport with method-aware routing.
- OpenAPI-driven API catalogs and independently registered modules under
  `src/apis/`.
- GET support across registered API prefixes, plus module-declared POST and
  PUT operations.
- HTTPie-style query and JSON body syntax, file-backed request bodies,
  JavaScript body values, PAPI context handling, response parsing, recording,
  and redacted diagnostics.
- Unsupported method/path combinations fail explicitly. PATCH, DELETE,
  activation, and deactivation workflows remain unsupported.

### Completion and help

- Command, method, OpenAPI path, query-parameter, JavaScript-property,
  executable, filesystem, pipeline, and state-file completion.
- Dynamic identifier completion through authenticated collection lookups with
  session caching.
- Variable and `${...}` expression-aware API and filesystem completion that
  preserves the original symbolic input.
- Contextual `?` API parameter help that preserves the input buffer and treats
  quoted question marks literally.

### Interruption

- Ctrl-C is forwarded from the frontend to the backend without closing the
  interactive shell.
- Node's native `breakEvalOnSigint` interrupts synchronous JavaScript loops.
- Active asynchronous commands are interrupted at the backend protocol layer,
  the backend remains alive, and subsequent input can use the existing
  session.
- Regression coverage verifies both synchronous evaluation recovery and
  asynchronous command recovery.

## Key discussion outcomes

- Issue #65: executable script support was implemented and completed.
- The native Node backend replaced the earlier in-process client design;
  compatibility breaks in session persistence and save formats were accepted.
- Completion became OpenAPI-driven and method-aware rather than being a
  collection of hard-coded REPL endpoint rules.
- `$()` uses the shared command parser and dispatcher. Interactive input
  automatically awaits substitutions; scripts use explicit top-level `await`.
- `${...}` command interpolation evaluates JavaScript only at the shell-command
  boundary, so native JavaScript template literals retain normal semantics.
- Configuration uses `config` as the authoritative live object. Structured
  settings use dotted paths; target shorthand updates `config.target` without
  creating duplicate top-level values.
- CommonJS `require()` is supported. ESM `import` was deliberately deferred
  because it requires a separate evaluation/scoping model.
- README documentation was rewritten for users, synthetic identifiers replaced
  real-looking examples, and architecture details were moved into `DESIGN.md`.
- Issue #61 was implemented and closed after native REPL SIGINT interruption
  was combined with frontend forwarding and backend async-command handling.

## Known limitations and not done

- The underlying EdgeGrid/network operation may continue after a logical
  asynchronous command interruption. Transport-level `AbortSignal`
  cancellation is not yet wired through all request paths.
- Local shell pipeline child processes are not yet centrally tracked and
  terminated on Ctrl-C.
- Completion does not cover every API-specific dynamic identifier or provide
  detailed diagnostics for every failed lookup.
- Query/body validation is metadata-assisted, not a complete generated-client
  type system.
- Pagination and automatic following of API links are not implemented.
- Ambiguous API paths use module precedence; there is no user-facing API
  selection syntax.
- ESM imports, PATCH, DELETE, activation, deactivation, and broader mutation
  confirmation workflows are unsupported.
- `src/repl.js` and `src/script-runner.js` remain as legacy implementation
  files. The active executable path does not use them.
- Live API requests require valid local credentials. Credentials and
  secret-bearing responses must never be committed.

## Validation and contribution entry points

Run the complete suite with:

```bash
npm test
```

Start the shell with:

```bash
npm start
```

When adding an API module, use the checked-in OpenAPI document, register the
module under `src/apis/`, and add routing, method-support, completion, and
response-shape tests without live credentials. Read `DESIGN.md` before making
cross-cutting changes.
