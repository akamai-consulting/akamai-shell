# Migration Plan: Node.js-Backed Hybrid Shell

Status: proposal for review.

This plan migrates the current VM-based execution model to a persistent
Node.js backend modeled on `ref/node-shell-hybrid`. The migration deliberately
allows breaking compatibility for session persistence and saved-state file
formats. It also defines command substitution as an explicitly asynchronous
operation that requires top-level `await`.

## Target architecture

```text
terminal frontend
    |
    | newline-delimited JSON requests and events
    v
persistent Node.js backend
    |
    +-- native Node.js REPL context
    +-- shell command parser and dispatcher
    +-- EdgeGrid transport and API registry
    +-- OpenAPI/static/dynamic completion
    +-- backend state and new persistence format
```

The frontend owns terminal concerns:

- readline prompt and terminal lifecycle;
- history navigation;
- rendering results, errors, stdout, and stderr;
- script-file input and shebang handling;
- forwarding completion requests;
- handling backend startup, exit, timeout, and broken pipes.

The backend owns execution concerns:

- persistent native JavaScript state;
- Node.js globals, modules, `require`, `process`, streams, and fetch;
- shell command parsing and execution;
- EdgeGrid settings and authenticated API requests;
- API-aware completion;
- command substitution;
- state save/load;
- structured result and error messages.

There will be no application-level `vm` context in the target design.

## Compatibility decisions

The migration may intentionally break:

- the current `~/.config/akamai-shell/env` persistence format;
- the current session persistence behavior;
- the current saved-variable representation;
- private `createRepl()` and `runScript()` module APIs;
- undocumented output formatting details;
- compatibility with old saved session files.

The new implementation should document the new state-file format and provide a
clear error when an old file is encountered. No compatibility shim should be
added unless it is simpler than rejecting the old format.

Command substitution uses explicit asynchronous semantics:

```js
result = await $('get /papi/v1/properties')
```

`$()` always returns a promise. A bare `$()` expression is valid JavaScript but
does not promise synchronous shell behavior; documentation and tests should
require `await` when the result is needed.

## Phase 1: establish the backend protocol

Create a persistent backend process based on
`ref/node-shell-hybrid/src/backend.js`.

### Protocol

Use newline-delimited JSON initially:

```json
{"id":1,"type":"evaluate","source":"await fetch(url)"}
{"id":2,"type":"command","source":"get /papi/v1/properties"}
{"id":3,"type":"complete","source":"get /papi/v1/pro","cursor":17}
```

Responses and events:

```json
{"id":1,"type":"result","value":42}
{"id":1,"type":"stdout","data":"hello\n"}
{"id":1,"type":"stderr","data":"warning\n"}
{"id":1,"type":"error","errorType":"TypeError","message":"...","stack":"..."}
{"id":1,"type":"done"}
```

Requirements:

- request IDs are mandatory;
- evaluations are processed sequentially;
- stdout and stderr are separate from result values;
- malformed protocol messages produce structured errors;
- pending requests fail when the backend exits;
- every request completes or times out;
- backend shutdown is deterministic and testable.

The current experiment’s test-suite lifecycle hang must be understood and
fixed before using its backend as a production foundation.

### Backend initialization

The frontend sends an initialization request before normal work:

```json
{
  "id":1,
  "type":"initialize",
  "scriptPath":"/path/to/script.as",
  "scriptArgs":["one","two"],
  "workingDirectory":"/path/to"
}
```

Initialization configures:

- `process.argv`;
- `process.cwd()` behavior or the backend working directory;
- relative `require()` resolution;
- environment/state-file location;
- logging and recording settings.

Interactive sessions use the configured working directory. Script sessions use
the script directory for relative modules and normal Node-style `process.argv`.

## Phase 2: move native JavaScript execution

Use the real Node.js REPL API with `useGlobal: true`, as in the experiment.
The backend must support:

- top-level `await`;
- multi-line JavaScript;
- native `process`, `global`, `globalThis`, timers, fetch, streams, and Buffer;
- `require`, `module`, `exports`, `__filename`, and `__dirname`;
- built-in modules and installed packages;
- persistent state between requests;
- normal native object and class behavior.

Add backend tests before porting shell commands:

- assignment and state reuse;
- top-level await;
- fetch response and stream access;
- `require('node:fs/promises')`;
- native errors and stack traces;
- multi-line blocks;
- console output as separate protocol events;
- backend timeout and shutdown.

Remove the current VM-specific global injection and response facades only after
the backend path is passing these tests.

## Phase 3: extract and port shell command execution

Port the current command behavior into backend handlers. Start with the
smallest stable command boundary, then add existing functionality in groups.

### Initial command set

```text
get API_PATH [QUERY]
post API_PATH [BODY]
put API_PATH [BODY]
show [EXPRESSION]
set NAME VALUE
help
exit
quit
```

The command parser must produce structured command objects rather than
concatenating user input into JavaScript source.

### Existing functionality to port

- generic GET/POST/PUT dispatch;
- `find`;
- `echo` and variable expansion;
- history;
- recording controls and record output;
- configuration display and updates;
- command help;
- shell pipelines where retained by the final design;
- explicit error categories and redaction.

The current EdgeGrid and API-specific modules should be reused:

- `src/edgegrid-transport.js`;
- `src/papi-client.js`;
- `src/api-registry.js`;
- `src/api-module.js`;
- `src/catalog.js`;
- `src/openapi-catalog.js`;
- modules under `src/apis/`;
- `src/logger.js`;
- `src/recorder.js`.

Refactor these modules only where they depend on `createRepl()` or direct
readline/output state.

## Phase 4: implement command substitution

Add a backend `$()` helper:

```js
data = await $('get /papi/v1/properties')
```

Rules:

- `$()` accepts one complete recognized shell command;
- it always returns a promise;
- the command uses the same backend dispatch path as a standalone command;
- command output is returned as structured data where possible;
- command diagnostics are not mixed into the returned value;
- command failures reject with a structured error;
- nested substitutions are not supported initially;
- explicit `await` is required in documentation and tests.

The helper must not route through the frontend. This keeps state and command
execution in one process and avoids serializing intermediate native values.

## Phase 5: port completion

Completion becomes a backend request so both completion systems can access the
same JavaScript state and shell settings.

### JavaScript completion

Delegate to the Node REPL completer for:

- identifiers;
- property access;
- module names in `require(...)`;
- Node globals;
- variables defined during the session.

### Shell/API completion

Reuse the current OpenAPI and API-module completion logic for:

- command names and options;
- API prefixes and static path segments;
- query parameters;
- POST/PUT body fields;
- dynamic identifiers from authenticated collection lookups;
- parameter help.

### Arbitration

The backend classifies completion context without evaluating input:

1. JavaScript property/module context uses Node completion.
2. A recognized shell-command context uses shell/API completion.
3. A JavaScript string or incomplete expression uses Node completion.
4. Dynamic completion has a bounded timeout and explicit failure fallback.

Add regression tests for the existing multi-variable path-completion behavior
before and after the migration.

## Phase 6: replace interactive frontend execution

Add a client/frontend module modeled on
`ref/node-shell-hybrid/src/client.js`.

Responsibilities:

- start and initialize the backend;
- send requests and correlate response IDs;
- render result/stdout/stderr/error messages;
- maintain history;
- forward Ctrl-C;
- handle backend exit;
- handle EPIPE;
- provide readline completion;
- preserve the existing prompt and user-facing error categories where useful.

The frontend must not execute JavaScript or API commands locally after the
backend becomes authoritative.

Initially retain a feature flag or separate entry point for comparison if this
reduces migration risk. Remove the old path only after the full suite and
manual smoke tests pass.

## Phase 7: migrate script execution

Replace direct `createRepl()` script execution with the backend client.

Script behavior:

- remove a leading shebang;
- pass the script path and remaining arguments during initialization;
- preserve multi-line JavaScript buffering;
- send JavaScript blocks as `evaluate` requests;
- send recognized shell lines as `command` requests;
- process requests strictly in source order;
- return the backend exit status;
- terminate the backend on completion or error;
- report unterminated JavaScript blocks clearly.

The script runner must not use temporary scratch directories for normal
execution.

## Phase 8: introduce new state persistence

Choose a new backend-native state format. The simplest initial format is an
executable JavaScript state file generated by the backend:

```js
globalThis.baseUrl = "https://example.com";
globalThis.helper = (value) => value.trim();
```

The format may preserve ordinary user functions and JSON-compatible values.
Native modules, streams, sockets, class instances, closures, and circular
objects should be excluded or reported explicitly.

Decisions:

- old environment files are rejected with a migration message;
- no automatic conversion is required;
- state is saved explicitly;
- the state file is treated as executable code and must be trusted;
- backend globals and shell internals are excluded.

History format and location may also change if that simplifies the new client.

## Phase 9: remove the VM implementation

After the backend implementation has parity for the selected command and
completion surface:

- remove `vm` imports and injected Node-global adapters;
- remove fetch/response facades;
- remove direct `createRepl()` execution;
- remove obsolete persistence serializers;
- remove compatibility-only code;
- update README and experiment documentation;
- retain only backend/client tests and public APIs that remain supported.

## Validation gates

### Backend gate

- all backend protocol tests pass;
- native Node.js tests pass;
- backend exits cleanly in every test;
- no request remains pending after a backend crash;
- output and errors remain separated.

### Command gate

- GET, POST, PUT, find, configuration, recording, and help behavior pass;
- EdgeGrid status and API errors remain explicit;
- no unsupported method silently becomes GET;
- command substitution uses the same transport as standalone commands.

### Completion gate

- JavaScript completion works for native Node globals and modules;
- API path completion works from OpenAPI metadata;
- dynamic completion uses configured credentials;
- completion never executes user input;
- lookup failures are visible and bounded.

### Script gate

- script arguments appear in normal `process.argv` positions;
- multi-line JavaScript works;
- shell and JavaScript requests execute in source order;
- saved state is loaded using the new format;
- broken output pipes exit cleanly.

### Full regression gate

- run the complete project suite;
- run backend/client integration tests;
- manually verify a read-only authenticated API request when credentials are
  available;
- verify no credentials or secret-bearing headers appear in output or state.

## Expected implementation order

1. Stabilize and test the experimental backend lifecycle.
2. Add protocol initialization and script metadata.
3. Move native JavaScript execution.
4. Extract and port transport-backed command handlers.
5. Port settings, recording, errors, and output formatting.
6. Port completion and dynamic API lookups.
7. Switch interactive frontend execution.
8. Switch script execution.
9. Add the new state format and remove old persistence.
10. Delete the VM implementation and compatibility code.

The migration should be performed in separate commits or branches per phase so
the old implementation remains recoverable until the backend and frontend have
passed the validation gates.
