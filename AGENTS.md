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

## Key documents and references

Read these documents before making changes:

- [`README.md`](README.md) - installation, user-facing commands, scripting,
  completion, and configuration usage.
- [`DESIGN.md`](DESIGN.md) - runtime architecture, module boundaries,
  protocols, persistence, interruption handling, testing guidance, and future
  directions.
- [`STATUS.md`](STATUS.md) - current implementation status, completed
  discussions, known limitations, and deferred work.
- [`ref/akamai-apis/`](ref/akamai-apis/) - checked-in OpenAPI documents and
  examples; the source of truth for API paths, methods, parameters, schemas,
  and completion metadata.
- [`ref/AkamaiOPEN-edgegrid-node/`](ref/AkamaiOPEN-edgegrid-node/) - reference
  for the permitted EdgeGrid signing library and credential handling.
- [`ref/httpie-edgegrid/`](ref/httpie-edgegrid/) - independent reference for
  EdgeGrid configuration and generic HTTP integration.

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
akamai> set edgercSection papi
akamai> get /papi/v1/properties
akamai> get /papi/v1/edgehostnames/<TAB>
```

The initial command grammar should include:

- `get [-f <path>] <api-path> [query parameters]` for read-only HTTP GET
  requests. With `-f`, formatted JSON output is written to the file.
  API paths include their service prefix, such as `/papi/v1/...` or
  `/cloudlets/v3/...`.
- `post [-f <path>] <api-path> [body/query arguments]` and
  `put [-f <path>] <api-path> [body/query arguments]` for method-qualified
  JSON writes. Body arguments use `name=value` for strings and `name:=value`
  for JSON values; `name==value` is a query parameter. With `-f`, the JSON
  body is read from the file and inline fields override it. With `-v`, a
  JavaScript JSON object supplies the initial body.
- `set <name> <value>` for scalar global settings and
  `set <object>.<property> <value>` for structured settings such as
  `set target.accountSwitchKey foo`. The existing top-level target fields
  remain supported as shorthand.
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

GET operations remain available across the registered API prefixes. Registered
modules may additionally support the POST and PUT operations declared by their
OpenAPI metadata. Unsupported method/path combinations must fail explicitly;
do not silently route them as GET requests. PATCH, DELETE, activation, and
deactivation workflows remain unsupported.

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

## Architecture and implementation details

The current module boundaries, message protocol, evaluation model, API
registration rules, completion design, persistence behavior, interruption
handling, and extension/testing guidance are maintained in `DESIGN.md`.
Read that document before changing architecture or adding cross-cutting
behavior. Keep this file focused on repository-wide constraints and safety
requirements rather than duplicating implementation plans.
