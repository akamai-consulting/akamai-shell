# Akamai Shell

`akamai-shell` is an interactive JavaScript-enabled console for calling
Akamai APIs directly. It solves the gap between one-off `curl`/HTTPie
commands and a full API client: requests use EdgeGrid authentication, API
paths and methods are validated from the checked-in OpenAPI documents, and
responses can be inspected, transformed, stored in variables, and reused in
later requests.

It is useful when you need to:

- Explore Akamai resources interactively without writing a client program.
- Reuse response data such as property IDs, versions, groups, and hostnames.
- Combine API calls with JavaScript expressions and local shell tools such as
  `jq`.
- Use the same generic request path for normal commands and tab completion.
- Record redacted HTTP exchanges while developing or troubleshooting scripts.

The shell currently includes modules for Property Manager, Cloudlets v2/v3,
Edge Diagnostics, Edge DNS/Config DNS, and DataStream Config. Supported
methods and paths vary by module; unsupported combinations fail explicitly.

## Installation and startup

Requirements: Node.js and an EdgeGrid resource file, normally
`~/.edgerc`.

```bash
npm install
npm start
```

Configure the credential file and section from inside the shell:

```text
akamai> config.edgerc = "~/.edgerc"
akamai> config.edgercSection = "papi"
```

Configuration and JSON-serializable session variables are persisted under
`~/.config/akamai-shell/`. Credential values and secret request headers are
never displayed or persisted by the shell.

## Quick command reference

| Command | Purpose |
| --- | --- |
| `get <api-path> [name==value ...]` | Make an authenticated GET request. |
| `post <api-path> [name=value ...]` | Make a JSON POST request. |
| `put <api-path> [name=value ...]` | Make a JSON PUT request. |
| `post|put -v <expression> <api-path>` | Use a JSON-serializable JavaScript value as the complete body. |
| `get -f <file> <api-path>` | Write formatted GET JSON to a file. |
| `post|put -f <file> <api-path>` | Read a JSON request body from a file. |
| `find <api-path> -q <rule>` | Fetch one response and find matching dictionaries locally. |
| `show [expression]` | Display the session namespace or one JSON value. |
| `echo <text>` | Print text after variable expansion. |
| `record auto\|on\|off` | Control redacted in-memory request recording. |
| `record show [--http]` | Display captured JSONL or HTTP-style records. |
| `history` | Display command history. |
| `help` / `?` | Display command help. |
| `exit` / `quit` | Leave the shell. |
| `! <command>` | Run a local shell command. |

Body fields use HTTPie-style syntax:

```text
post /edge-diagnostics/v1/curl url=https://example.test timeout:=30 enabled:=true
```

`name=value` creates a string field. `name:=value` parses the value as JSON,
so numbers, booleans, arrays, objects, and `null` remain typed. Query
parameters use `name==value`, either in the path or as separate arguments.

API paths include their service prefix, for example:

```text
get /papi/v1/properties
get /cloudlets/v3/policies/371861/versions
get /edge-diagnostics/v1/curl
```

Press Tab while entering a command to complete command names, static API
segments, query parameters, and dynamic identifiers fetched from collection
endpoints. Failed or empty completion lookups remain silent.

## JavaScript integration

Lines that are not shell commands are evaluated as JavaScript in the current
session. Values can be assigned, updated, indexed, filtered, and passed to
later requests:

```javascript
config.contractId = "ctr_123"
config.groupId = "grp_456"

groups = await $("get /papi/v1/groups")
groups.groups.items

matching = groups.groups.items.filter(group =>
  group.groupName.includes("production")
)
```

The asynchronous `$()` helper runs an internal GET and returns the decoded
response body without printing the nested command output. It also supports a
local pipeline:

```javascript
properties = $(`get /papi/v1/properties | jq '.properties.items[]'`)
```

JavaScript values can be used as complete POST or PUT bodies. Quoting a
variable keeps a JSON value containing spaces or quotes together:

```javascript
rules = await $("get /papi/v1/properties/prp_526230/versions/79/rules")
```

```text
put -v "$rules" /papi/v1/properties/prp_526230/versions/79/rules
```

The shell also supports property and index expansion in command arguments:

```text
get /papi/v1/properties/$properties["properties"]["items"][0]["propertyId"]
show matching[0]
```

Functions are available for the current session, but external Node.js module
loading is not exposed. Function values are not persisted as environment
JSON.

## Example interactive session

```text
$ npm start
akamai> config.edgerc = "~/.edgerc"
akamai> config.edgercSection = "papi"
"papi"
akamai> groups = await $("get /papi/v1/groups")
akamai> groups.groups.items.filter(g => g.groupName.includes("production"))
[
  {
    "groupName": "production",
    "groupId": "grp_123",
    "parentGroupId": "grp_1",
    "contractIds": ["ctr_123"]
  }
]
akamai> get /papi/v1/properties groupId==grp_123
{
  "properties": {
    "items": [
      {
        "propertyId": "prp_456",
        "propertyName": "www.example.com",
        "latestVersion": 12
      }
    ]
  }
}
akamai> properties = await $("get /papi/v1/properties groupId==grp_123")
akamai> find /papi/v1/properties -q 'propertyName=~example'
[
  {
    "path": "/papi/v1/properties/prp_456",
    "resource": {
      "propertyId": "prp_456",
      "propertyName": "www.example.com",
      "latestVersion": 12
    }
  }
]
akamai> get /papi/v1/properties | jq '.properties.items[] | .propertyName'
"www.example.com"
akamai> exit
```

`find` makes exactly one GET request for the supplied path and scans that
response locally; it does not recursively fetch child resources.

## Development

Run the test suite with:

```bash
npm test
```

The executable entry point is `src/main.js`. API-specific behavior lives in
modules under `src/apis/`, while the generic transport, request parsing,
completion, and JavaScript session behavior are implemented in `src/`.
