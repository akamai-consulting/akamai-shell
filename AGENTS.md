# Project Guidance

## Purpose

This project should provide an interactive, read-only console shell for the
Akamai Property Manager API (PAPI). It is a sample application intended to
demonstrate direct HTTP API access rather than access through a
Property Manager wrapper or domain-specific client library.

The project is currently a Node.js CommonJS application. Keep the executable
entry point consistent with `package.json` (`src/main.js`).

## API access

- Use the Property Manager API documented at
  <https://techdocs.akamai.com/property-mgr/reference/api-summary>.
- The API base path is `/papi/v1`; the host comes from the selected EdgeGrid
  credential section.
- Construct requests with a generic HTTP client and parse the HTTP responses
  in the application.
- An existing EdgeGrid authentication library may be used to sign requests.
  Do not use a Property Manager wrapper library that hides endpoint construction
  or response handling.
- Read credentials from an EdgeGrid resource file, normally `~/.edgerc`.
  Credentials and credential files must not be copied into this repository,
  logged, or committed.
- The credential section must be configurable at runtime. Do not hard-code an
  account, host, token, or section name.
- Preserve and expose meaningful HTTP status codes and API error responses
  instead of converting failures into successful-looking output.

## Interactive shell

The application should run as a REPL and support commands in this general
form:

```text
prompt> set edgerc ~/.edgerc
prompt> set edgerc-section papi
prompt> get /properties
prompt> get /edgehostnames/<TAB>
```

The initial command grammar should include:

- `get <api-path> [query parameters]` for read-only HTTP GET requests.
- `set <name> <value>` for global settings.
- `show` or an equivalent command for displaying non-sensitive settings.
- `help` and `exit`/`quit`.

Global settings, such as the EdgeGrid file path and credential section, should
be retained by the REPL session and should not need to be repeated on every
request.

## Tab completion

Completion is a core feature, not merely static command help. It should
support:

1. Static API path segments and operation structure derived from the checked-in
   OpenAPI references under `ref/akamai-apis/apis/papi/v1/`.
2. Dynamic path values such as property IDs, edge hostname IDs, versions, and
   other identifiers.
3. Fetching candidates by calling the relevant parent collection endpoint,
   authenticated through the configured EdgeGrid credentials. For example,
   completing `/edgehostnames/<TAB>` should call `GET /edgehostnames` and use
   the response to produce candidates.
4. Avoiding unnecessary requests by caching candidates during a completion
   session where practical, while ensuring stale or failed completion results
   are reported clearly.

Completion requests must use the same generic HTTP request and response
handling path as normal `get` commands. They must not mutate Akamai
configuration.

## Read-only scope

Only GET operations should be enabled initially. Do not implement POST, PUT,
PATCH, or DELETE commands, and do not provide activation or deactivation
operations until the project requirements explicitly expand beyond read-only
access.

Likely useful read operations include:

- Listing and getting properties.
- Listing property versions and getting a specific version.
- Reading property or include rule trees.
- Listing and getting edge hostnames.
- Listing groups, contracts, products, and CP codes where the account permits
  access.

## Local references

Use these checked-in references when implementing or extending the sample:

- `ref/akamai-apis/apis/papi/v1/openapi.json` is the complete PAPI OpenAPI
  document and the primary source for endpoint discovery.
- `ref/akamai-apis/apis/papi/v1/01-prerequisites.yaml` describes prerequisite
  collection endpoints such as groups, contracts, products, CP codes, and
  edge hostnames.
- `ref/akamai-apis/apis/papi/v1/04-properties.yaml` describes the property,
  property-version, hostname, and rule-tree endpoints.
- `ref/akamai-apis/apis/papi/v1/paths/` contains the operation definitions
  referenced by the split OpenAPI documents. In particular, inspect
  `properties.yaml`, `property.yaml`, `property-versions.yaml`,
  `property-version.yaml`, `property-version-rules.yaml`,
  `edge-hostnames.yaml`, and `edge-hostname.yaml`.
- `ref/akamai-apis/apis/papi/v1/parameters/` contains reusable path, query, and
  header parameter definitions. Pay particular attention to
  `PAPI-Use-Prefixes-header.yaml`, `contractId-optional.yaml`,
  `groupId-optional.yaml`, `propertyId-path.yaml`, and
  `propertyVersion-path.yaml`.
- `ref/akamai-apis/apis/papi/v1/schemas/` contains response and request
  schemas, including `property-get-response.yaml`,
  `property-version-get-response.yaml`, and
  `property-version-rules-get-response.yaml`.
- `ref/akamai-apis/apis/papi/v1/examples/` contains representative payloads
  for collection responses and rule trees. Useful examples include
  `property-list-response.json`, `property-get-response.json`,
  `property-version-list-response.json`, `property-version-get-response.json`,
  `edgehostname-list-response.json`, and `rules-get-response.json`.
- `ref/AkamaiOPEN-edgegrid-node/README.md` documents the permitted EdgeGrid
  signing library, Promise-based request API, `.edgerc` loading, query
  parameters, headers, and response handling.
- `ref/AkamaiOPEN-edgegrid-node/src/auth.js` and
  `ref/AkamaiOPEN-edgegrid-node/src/edgerc.js` are useful implementation
  references for signing requests and reading credential sections.
- `ref/AkamaiOPEN-edgegrid-node/src/api.js` shows the low-level HTTP request
  flow exposed by the EdgeGrid library.
- `ref/AkamaiOPEN-edgegrid-node/package.json` identifies the package and
  supported Node.js runtime expectations for the reference implementation.
- `ref/httpie-edgegrid/README.md` provides an independent reference for
  EdgeGrid configuration, `~/.edgerc`, section selection, query parameters,
  headers, and debugging.
- `ref/httpie-edgegrid/httpie_edgegrid.py` shows how the HTTPie integration
  connects EdgeGrid authentication to a generic HTTP client.

Do not edit the reference material as part of normal feature work.

## Output and safety

- Default API output should preserve the response data as readable JSON.
- Do not print client secrets, access tokens, or secret-bearing request headers.
- Distinguish shell/parser errors, authentication errors, transport errors, and
  API errors when reporting failures.
- Keep behavior predictable for paths, query parameters, quoting, and
  completion; avoid silently ignoring invalid input.

## Design

Use small modules with explicit boundaries:

- **REPL layer:** Owns the readline loop, prompt, command dispatch, session
  lifecycle, and user-facing errors.
- **Command/parser layer:** Parses `get`, `set`, `show`, `help`, and `exit`
  commands. It should preserve quoted values and reject unsupported methods or
  malformed paths explicitly.
- **Session configuration:** Stores the EdgeGrid resource-file path, credential
  section, and any completion settings. Sensitive credential values remain in
  the EdgeGrid library and are never copied into shell state for display.
- **HTTP transport layer:** Accepts a method, API path, query parameters, and
  headers; resolves the configured EdgeGrid credentials; signs the request;
  sends it through a generic HTTP client; and returns status, headers, and body.
  This layer must not contain Property Manager-specific business logic.
- **PAPI API/catalog layer:** Loads the checked-in PAPI OpenAPI description and
  normalizes endpoint templates, allowed methods, path parameters, query
  parameters, and response metadata. It is responsible for API-specific
  discovery, not for sending requests.
- **Completion layer:** Uses the catalog for static path completion and the
  transport layer for dynamic collection lookups. It should return completion
  candidates separately from normal command output and handle asynchronous
  lookup failures without crashing the REPL.
- **Output layer:** Formats successful JSON responses for the terminal and
  formats errors consistently while redacting sensitive headers and values.

The transport and catalog boundaries should make it possible to test parsing,
endpoint resolution, and completion without making live Akamai requests.
Completion and command execution should share request construction so that
they cannot silently disagree about the `/papi/v1` prefix, credential section,
headers, or query encoding.

## Implementation plan

Implement the project in the following phases:

1. **Establish the executable shell**
   - Add the `src/main.js` entry point and a readline-based REPL.
   - Implement command tokenization, dispatch, `help`, `exit`, and `quit`.
   - Define a session configuration object with safe defaults and validation.

2. **Implement configuration commands**
   - Implement `set edgerc <path>` and `set edgerc-section <section>`.
   - Expand `~` only for local file paths, and keep the configured path
     displayable without reading or printing secret contents.
   - Implement `show` for non-sensitive configuration values.

3. **Implement authenticated GET requests**
   - Add an approved EdgeGrid authentication dependency if needed.
   - Add a generic HTTP transport that reads the configured `.edgerc`, signs
     requests, sends GET requests, parses response bodies, and preserves
     status information.
   - Implement `get <path>` with API path validation, query-string handling,
     readable JSON output, and explicit transport/authentication/API errors.
   - Ensure the PAPI base path and required headers are applied according to
     the API definition.

4. **Build API metadata and static completion**
   - Load the PAPI OpenAPI source from `ref/akamai-apis/apis/papi/v1/`.
   - Resolve local references and create an endpoint catalog for GET
     operations, path templates, path parameters, and query parameters.
   - Add completion for command names, static path segments, and supported
     parameter positions.

5. **Add dynamic completion**
   - Identify the collection endpoint needed for the currently incomplete
     path, such as `GET /edgehostnames` for
     `/edgehostnames/<partial-value>`.
   - Call that endpoint through the same authenticated transport used by
     `get`.
   - Extract identifiers from known PAPI collection response shapes and
     filter them by the partial token.
   - Cache successful candidates for the current REPL session where useful;
     report lookup failures clearly and fall back to static completion when
     possible.

6. **Harden and document the sample**
   - Test command parsing, settings, path validation, endpoint resolution,
     response parsing, redaction, and completion with mocked transport data.
   - Exercise at least one live read manually only when valid local credentials
     are available; never add those credentials or responses containing secrets
     to the repository.
   - Document installation, startup, `.edgerc` setup, supported commands,
     completion behavior, and current read-only limitations.

Do not broaden the implementation to write operations, activation workflows,
or a general-purpose API client during these phases. Any such expansion should
first update this document and define the corresponding safety and confirmation
requirements.
