# Project Status

## Current state

- Project: `config-read`, an interactive read-only Akamai Property Manager API
  (PAPI) shell.
- Active branch: `feature/more-read-only-access`.
- Initial commit on `main`:
  `82742ac Initial working version of Akamai shell`.
- The feature-branch changes after that commit are currently uncommitted.
- The supplied `ref/` directories remain untracked because each is an embedded
  Git repository.

## Requirements discussed

The project is intended to:

- Access Akamai PAPI through direct HTTP endpoint construction.
- Use a generic HTTP client for requests and response parsing.
- Permit an existing EdgeGrid library for request authentication.
- Read credentials from `~/.edgerc` without storing credentials in the project.
- Provide an interactive console shell with API-path tab completion.
- Use dynamic API calls to complete identifiers such as properties and edge
  hostnames.
- Remain read-only: only GET operations are enabled.
- Support shell pipelines, command history, session variables, and persistent
  parameter defaults.

## Completed

### Authentication and PAPI requests

- EdgeGrid authentication using the configured `.edgerc` section.
- Direct PAPI request paths with the `/papi/v1` prefix.
- JSON response parsing.
- HTTP/API error status and response-body reporting.
- `PAPI-Use-Prefixes: true` request header.
- Optional `accountSwitchKey` support.
- Global `contractId`, `groupId`, and other query-parameter defaults.
- Inline HTTPie-style query syntax:

  ```text
  get /cpcodes contractId==ctr_123 groupId==grp_456
  ```

- Inline query parameters override configured defaults.
- Required-parameter validation for several contextual resources.

The installed `akamai-edgegrid@4.0.4` callback API is wrapped in a Promise by
the project transport layer.

### Interactive shell

Supported commands:

```text
get <api-path>[?query=value] [name==value ...]
set <name> <value>
set
unset <name>
unset -a
save [-f <path>]
load [-f <path>]
show
history
echo <text>
help
exit
quit
```

- Custom variables can be defined and expanded with `$name`.
- `set` displays current settings and custom variables.
- `unset` changes only in-session state; it never modifies persisted files.
- `unset -a` clears all in-session API parameter defaults.

### Completion

- Static completion for documented PAPI resource paths.
- Partial static segment completion, such as:

  ```text
  get /cp<TAB>
  ```

  completing to `/cpcodes`.

- Dynamic completion for:
  - Contract IDs
  - Group IDs
  - Property IDs
  - Property versions
  - Edge hostname IDs
  - CP code IDs
  - Product IDs
  - Include IDs and include versions
  - Property activation IDs
  - Property hostname activation IDs
  - Custom behavior IDs
  - Custom override IDs
- Query-parameter name completion using HTTPie-style `name==` syntax.

### Pipelines and history

- `get` output can be sent to arbitrary local shell pipelines:

  ```text
  get /groups | jq '.groups.items'
  ```

- Downstream `EPIPE` errors are handled without terminating the REPL.
- In-session history supports up/down navigation.
- `C-r` performs reverse history search; repeated `C-r` searches older matches.
- History is persisted at:
  `~/.config/akamai-shell/history`.
- History is saved on every command line before execution and again on close.

### Parameter environment

- Parameter defaults are persisted at:
  `~/.config/akamai-shell/env`.
- `save` and `load` support the default path or `-f <path>`.
- Environment files are written atomically with restrictive permissions.
- `set` updates the default parameter environment immediately.
- Custom shell variables and credential settings are not persisted in the
  parameter environment.

## Tests and validation

The project has 33 passing Node.js tests covering:

- PAPI request construction and query defaults.
- Required parameter validation.
- HTTPie-style query parsing.
- Static and dynamic completion.
- Pipeline parsing and early-pipe closure.
- History persistence and reverse search.
- Custom variables.
- Parameter environment save/load and `unset -a`.

Run the tests with:

```bash
npm test
```

Start the shell with:

```bash
npm start
```

## Not yet done

- The API catalog is still manually maintained in `src/catalog.js`; it does
  not yet load and resolve the PAPI OpenAPI definitions automatically.
- Completion does not yet cover every dynamic identifier and every
  operation-specific parameter.
- Query-parameter validation is based on a partial hand-maintained map rather
  than all OpenAPI operation metadata.
- Pagination and automatic following of PAPI `nextLink` values are not
  implemented.
- Custom shell variables are session-only and are not persisted.
- There is no dedicated user-facing README or installation guide yet.
- Write operations, activation/deactivation, and mutation confirmation flows
  are intentionally not implemented.
- The feature-branch changes have not yet been committed.
- The `ref/` repositories have not been incorporated into the new outer
  repository; they remain available locally as supplied reference material.

## Important files

- `src/main.js` - executable entry point.
- `src/repl.js` - shell commands, completion, history, variables, pipelines,
  and persistence.
- `src/papi-client.js` - EdgeGrid-authenticated PAPI GET transport.
- `src/catalog.js` - static and dynamic read-only path catalog.
- `test/` - unit tests.
- `AGENTS.md` - project requirements, design, and implementation guidance.
