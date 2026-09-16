# Project Guidance

## Purpose

This project should provide an interactive console shell for Akamai APIs,
initially including Property Manager (PAPI). It is a sample
application intended to demonstrate direct HTTP API access rather than access
through a Property Manager wrapper or domain-specific client library.

The project is currently a Node.js CommonJS application. Keep the executable
entry point consistent with `package.json` (`src/main.js`). API-specific
behavior must live in modules registered through `src/api-registry.js`; the
REPL should not contain endpoint-specific request or completion logic.

## API access

- Use the Property Manager API documented at
  <https://techdocs.akamai.com/property-mgr/reference/api-summary>.
- The PAPI base path is `/papi/v1`; other API modules provide their own
  documented service prefixes. The host comes from the selected EdgeGrid
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
akamai> set edgerc ~/.edgerc
akamai> set edgerc-section papi
akamai> get /papi/v1/properties
akamai> get /papi/v1/edgehostnames/<TAB>
```

The initial command grammar should include:

- `get [-f <path>] <api-path> [query parameters]` for read-only HTTP GET
  requests. With `-f`, formatted JSON output is written to the file.
  API paths include their service prefix, such as `/papi/v1/...` or
  `/cloudlets/v3/...`.
- `post [-f <path>] <api-path> [body arguments]` and
  `put [-f <path>] <api-path> [body arguments]` for method-qualified JSON
  writes. Body arguments use `name=value` for strings and `name:=value` for
  JSON values. With `-f`, the JSON body is read from the file.
- `set <name> <value>` for global settings.
- `show` or an equivalent command for displaying non-sensitive settings.
- `help` and `exit`/`quit`.

Global settings, such as the EdgeGrid file path and credential section, should
be retained by the REPL session and should not need to be repeated on every
request.

## Tab completion

Completion is a core feature, not merely static command help. It should
support:

1. Static API path segments, HTTP methods, and query parameters derived from
   the checked-in OpenAPI documents under `ref/akamai-apis/apis/`.
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

## Operation scope

GET operations remain available across the registered API prefixes. The Edge
Diagnostics module additionally supports the POST operations declared in its
OpenAPI document. PUT is implemented by the generic parser, registry, and transport
layers, but no currently registered module claims a PUT endpoint. Unsupported
method/path combinations must fail explicitly; do not silently route them as
GET requests. PATCH, DELETE, activation, and deactivation workflows remain
unsupported.

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
- **HTTP transport layer (`src/edgegrid-transport.js`):** Accepts a method, API path, query parameters, and
  headers; resolves the configured EdgeGrid credentials; signs the request;
  sends it through a generic HTTP client; and returns status, headers, and body.
  This layer must not contain Property Manager-specific business logic.
- **API modules and registry:** `ref/akamai-apis` is the static source of
  truth for OpenAPI operation paths, methods, intermediate completion paths,
  and query parameters. Each API module keeps only API-specific validation,
  transport behavior, and dynamic completion descriptors locally. The
  registry automatically loads modules from `src/apis/` and routes
  API-qualified paths. Shared prefix matching, path conversion, static
  completion, dynamic lookups, caching, and candidate formatting live in
  `src/api-module.js` and `src/path-completion.js`.
  New modules must be addable without changing REPL command parsing or
  registry core code.
- The current modules are Property Manager, Cloudlets v3, Cloudlets v2, Edge
  Diagnostics v1, and Edge DNS/Config DNS v2. Modules declare method support
  separately from their API-prefix support; Edge Diagnostics enables its
  OpenAPI POST paths while the other modules currently enable GET dispatch.
- **PAPI transport/catalog layer:** The Property Manager module uses the
  generic transport through `src/papi-client.js` for PAPI-specific headers,
  contextual IDs, and required-parameter validation. `src/catalog.js` loads
  static metadata from the PAPI OpenAPI document and retains only PAPI
  dynamic descriptors and contextual completion behavior locally.
- **Completion layer:** Uses shared completion helpers for static matching and
  dynamic collection lookups. Dynamic descriptors use consistent
  `matches`, `collection`, `prefix`, `response`, and `key` names; modules
  provide only API-specific catalog and response-shape details.
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

4. **Implement method-qualified JSON writes**
   - Parse `post` and `put` commands with HTTPie-style JSON body arguments.
   - Route only to modules that declare the requested method and path.
   - Preserve EdgeGrid signing, query/default/account-switch-key handling,
     response status, headers, and body parsing.

5. **Build API metadata and static completion**
   - Load the service OpenAPI JSON from `ref/akamai-apis/apis/<service>/`.
   - Resolve local references and create endpoint catalogs for HTTP methods,
     operation paths, intermediate completion paths, and query parameters.
   - Add completion for command names, static path segments, and supported
     parameter positions.

6. **Add dynamic completion**
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

7. **Harden and document the sample**
   - Test command parsing, settings, path validation, endpoint resolution,
     response parsing, redaction, and completion with mocked transport data.
   - Exercise at least one live read manually only when valid local credentials
     are available; never add those credentials or responses containing secrets
     to the repository.
   - Document installation, startup, `.edgerc` setup, supported commands,
     completion behavior, and the currently declared write-method limitations.

Do not broaden the implementation beyond declared API metadata, generic
method-aware transport, and JSON write commands. Any activation workflow or
other mutation should first update this document and define corresponding
safety and confirmation requirements.
