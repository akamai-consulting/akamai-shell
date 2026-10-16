# Akamai Shell Design

This document describes the current application structure and the boundaries
that should be preserved when extending the shell. The application is a
Node.js CommonJS program that provides a persistent JavaScript session,
interactive shell commands, authenticated Akamai API access, completion, and
script execution.

## Runtime architecture

`src/main.js` is the executable entry point declared by `package.json`. It
selects one of two client modes:

```text
terminal or script file
        |
        v
    src/client.js
        |
        | child process, newline-delimited JSON
        v
    src/backend.js
        |
        +-- command parsing and JavaScript evaluation
        +-- API registry and completion
        +-- session state and persistence
        +-- request transport
```

The frontend owns the terminal, readline, prompts, history, script line
handling, and user-facing output. The backend is a persistent child process.
Keeping JavaScript evaluation in the backend allows variables, functions,
loaded modules, and configuration to survive across requests without
restarting the shell.

Frontend/backend messages are newline-delimited JSON. A request has an `id`
and `type`; responses use `result`, `error`, and `done` messages. Backend
stdout and stderr captured during JavaScript evaluation are forwarded as
separate output messages. Do not introduce an endpoint-specific protocol:
new operations should fit the existing request types or be implemented behind
the existing command/evaluation boundaries.

## Frontend responsibilities

`src/client.js` contains `BackendClient`, `runInteractive`, and the script
runner used by `main.js`.

`BackendClient`:

- starts `src/backend.js` with `child_process.spawn`;
- serializes requests and correlates responses by request ID;
- exposes `initialize`, `evaluate`, `command`, `complete`, and contextual-help
  requests;
- forwards Ctrl-C to the backend child without killing the frontend;
- reports backend termination and rejects pending requests.

Interactive mode uses Node readline. It keeps history in
`.akamai-shell-history`, routes shell-command lines to `command`, and routes
other lines to JavaScript `evaluate`. Blank lines only refresh the prompt.
The frontend intercepts Ctrl-C through readline's `SIGINT` event so the
session remains open.

Script mode:

- strips a first-line shebang;
- skips blank lines and lines whose trimmed content starts with `#`;
- sends recognized shell commands to `command`;
- accumulates JavaScript until `statement-completion.js` reports a complete
  statement;
- exposes the script path, arguments, and working directory during backend
  initialization.

Interactive and script execution intentionally differ for command
substitution: interactive JavaScript automatically awaits `$()` substitutions;
script JavaScript retains normal Promise semantics and should use explicit
top-level `await`.

## Backend responsibilities

`src/backend.js` owns the persistent runtime. It creates a native Node
`repl.Server` with `useGlobal: true`, so the REPL context and `globalThis`
share the same session namespace. The backend queue serializes incoming
requests and preserves command order.

The backend distinguishes:

1. JavaScript evaluation through the native REPL evaluator.
2. Parsed shell commands such as `get`, `post`, `put`, `set`, `show`, `echo`,
   `find`, `record`, `save`, and `load`.
3. Completion and contextual-help requests.

Unrecognized command-shaped input is evaluated as JavaScript. Endpoint
knowledge must not be added to the frontend or to generic command parsing;
API-specific behavior belongs in registered API modules.

### Ctrl-C behavior

The backend REPL uses Node's `breakEvalOnSigint` option. During synchronous
JavaScript evaluation, SIGINT becomes
`ERR_SCRIPT_EXECUTION_INTERRUPTED` instead of terminating the backend.

Outside JavaScript evaluation, the backend installs a SIGINT handler so an
asynchronous command does not terminate the process. Active parsed commands
are wrapped in an interruptible race; Ctrl-C rejects the current command,
emits an error response, and allows the next queued request to run. The
underlying network operation may still need transport-level cancellation in
future work, so changes to request transport should preserve this logical
interruption behavior while adding `AbortSignal` support where the client
library permits it.

## API routing and transport

### Registry and modules

`src/api-registry.js` loads modules from `src/apis/` and selects the module
whose documented service prefix and OpenAPI path match a request. Modules
declare supported methods independently from their prefixes. Unsupported
method/path combinations must fail explicitly; never silently reinterpret a
write as a GET.

Most modules are created with `src/api-module.js` and
`src/openapi-catalog.js`. Their static metadata comes from checked-in
OpenAPI documents under `ref/akamai-apis/apis/`. A module should contain only
service-specific details such as a prefix, catalog location, response-shape
extractors, contextual settings, or exceptional transport behavior.

To add an API:

1. Add or identify its checked-in OpenAPI document.
2. Create a module in `src/apis/`.
3. Declare its prefix, catalog, supported methods, and dynamic completion
   descriptors.
4. Add focused routing, method, completion, and response-shape tests.

Do not modify REPL parsing or registry core logic for a normal new API.

### Transport layers

`src/edgegrid-transport.js` is the generic authenticated transport. It:

- validates API paths and HTTP methods;
- loads the configured EdgeGrid section;
- applies query defaults and account-switch-key settings;
- merges command-supplied HTTP headers case-insensitively over API defaults;
- signs and sends requests through `akamai-edgegrid`;
- parses JSON response bodies while preserving non-JSON bodies;
- returns status code, headers, and body;
- records and logs requests through redacting helpers.

`src/papi-client.js` adds PAPI-specific behavior on top of the generic
transport, including PAPI headers, contextual contract/group values, and
OpenAPI-supported query filtering. It must not be replaced with a
Property Manager wrapper library that hides endpoint construction.

Completion requests use the same registry and transport path as normal GET
operations. This keeps prefixes, credentials, headers, contextual IDs, and
query encoding consistent between completion and execution.

## Completion

Completion is implemented across `src/api-registry.js`,
`src/api-module.js`, `src/path-completion.js`, and backend/frontend adapters.

It has three layers:

1. Command and method completion.
2. Static path and query-parameter completion from OpenAPI metadata.
3. Dynamic identifier completion from authenticated collection GETs.

Dynamic descriptors identify the incomplete path, collection endpoint, response
field, candidate prefix, and identifier key. Successful lookups are cached in
the current backend session. Failures should be visible or fall back to
static completion; they must not mutate Akamai configuration.

The backend also completes JavaScript variables and nested properties, shell
executables from `PATH`, filesystem paths, pipeline segments, and `load`/`save`
paths. Expression-aware path completion may evaluate a filesystem expression
only to locate candidates; it must preserve the symbolic expression in the
inserted text.

Contextual `?` help uses the same OpenAPI operation and parameter metadata as
completion. A question mark inside quotes remains literal, and the current
input buffer must be preserved.

## Configuration and persistence

The live configuration object is `globalThis.config` and is also stored in the
backend settings object. It contains non-secret settings such as:

- EdgeGrid resource-file path;
- EdgeGrid credential section;
- target values such as contract ID, group ID, and account-switch key;
- timeout and recording settings.

Credential contents are kept by the EdgeGrid library. They must never be
copied into session state, displayed by `show`, logged, or committed.

`parameterDefaults` and `recorder` are hidden runtime metadata. Code that
replaces `config` with a plain object must allow the backend to recreate this
metadata before handling `set`, requests, or recording.

`save` writes executable JavaScript state for persistable variables, functions,
and configuration. `load` evaluates a state file in the current persistent
context and then synchronizes configuration. `startup.js` is loaded during
initialization when present; `state.js` is not loaded automatically.
Filesystem paths for `load` and `save` expand `~` locally.

## Output, errors, and safety

Successful API output preserves response data as readable JSON. Errors should
retain their category and meaningful message:

- parser or command validation errors;
- authentication and credential errors;
- transport errors;
- API responses and status failures;
- JavaScript evaluation errors;
- interrupted operations.

Use `src/logger.js` and `redact` for diagnostics. Never log secret-bearing
headers, tokens, credential file contents, or real credentials in tests and
documentation. API mutations must remain limited to methods declared by the
registered module metadata. Activation, deactivation, PATCH, and DELETE
workflows require an explicit design update before implementation.

## Testing and extension guidelines

Run the full suite with:

```text
npm test
```

Prefer focused tests for the smallest affected layer, then run the full suite
before completing a cross-cutting change. Transport and API tests should use
mock clients or registry functions rather than live credentials. Backend tests
can use the in-memory stream harness; frontend interruption tests may use the
real `BackendClient` child process.

When changing a cross-layer behavior, test both sides of the boundary. For
example, a new command should cover parser dispatch, backend output, and
frontend result handling; a new API should cover routing, method rejection,
request construction, response parsing, and completion. Preserve the
CommonJS module format and keep `src/main.js` as the executable entry point.

The earlier in-process REPL implementation (`src/repl.js` and
`src/script-runner.js`) has been removed now that the active executable path
(`main.js -> client.js -> backend.js`) has fully replaced it.

## Future directions

These are possible directions, not commitments. Any implementation should
first preserve the boundaries above and update `STATUS.md` when the scope or
support matrix changes.

### Design directions

- Make cancellation a first-class request concern. The current protocol can
  interrupt a command logically, but transport cancellation and subprocess
  termination should have explicit lifecycle messages and ownership.
- Define a stable cancellation/error model shared by JavaScript evaluation,
  API requests, completion lookups, and local pipelines.
- Keep OpenAPI metadata as the source of truth while making module-specific
  response extractors and contextual settings declarative where practical.
- Decide whether session persistence needs versioning or migration once the
  state format stabilizes. Persisted files are executable JavaScript and must
  remain clearly separate from secrets.
- Establish a deliberate policy for additional mutation methods, including
  confirmation, dry-run behavior, and activation/deactivation safety.

### Implementation directions

- Thread `AbortController` signals through `edgegrid-transport.js`,
  `papi-client.js`, API modules, and the EdgeGrid client where supported.
- Track local pipeline child processes so Ctrl-C can terminate the complete
  process group without terminating the shell.
- Improve interrupted-request cleanup so late network responses cannot affect
  recording, output, or subsequent command state.
- Add pagination helpers and consistent opt-in handling for collection
  endpoints, while keeping one-command responses predictable by default.
- Expand completion diagnostics and metadata coverage without turning the
  registry into a generated client or making live requests during static
  completion.
- Add protocol-level integration tests for cancellation, backend restart
  behavior, late responses, and frontend recovery.
- Evaluate ESM support only with an explicit execution/scoping design; do not
  add a partial `import` implementation to the current CommonJS context.
- Consolidate documentation and release checks so `STATUS.md`, API method
  support, and the test baseline are updated whenever a feature changes.
