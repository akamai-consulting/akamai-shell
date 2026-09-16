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

Clone the repository with its checked-in API reference submodule:

```bash
git clone --recurse-submodules https://github.com/tai/akamai-shell.git
cd akamai-shell
```

For an existing checkout, initialize or update the submodules with:

```bash
git submodule update --init --recursive
```

```bash
npm install
npm start
```

To install the shell as a global CLI from a local checkout:

```bash
npm install -g .
```

For a development checkout, use a link instead:

```bash
npm link
```

Both commands install the `akamai-shell` executable, which can then be run
from any directory:

```bash
akamai-shell
```

Configure the credential file and section from inside the shell:

```text
akamai> config.edgerc = "~/.edgerc"
akamai> config.edgercSection = "papi"
```

Set the active API request target as one value. Use the identifiers from your
own account:

```javascript
config.target = {
  accountSwitchKey: "your-account-switch-key",
  contractId: "your-contract-id",
  groupId: "your-group-id"
}
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
| `echo <text> [\| command]` | Print expanded text, optionally through a local shell pipeline. |
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
config.target = {
  accountSwitchKey: "your-account-switch-key",
  contractId: "your-contract-id",
  groupId: "your-group-id"
}

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

It can also capture a local shell command. This is useful for loading external
JSON into the JavaScript session:

```javascript
foo = $('! cat foo.json')
```

Shell output is parsed as JSON when possible; non-JSON output remains a string.

The `echo` command can pipe expanded JSON variables to local tools:

```text
echo "$foo" | jq '. | keys'
```

JavaScript values can be used as complete POST or PUT bodies. Quoting a
variable keeps a JSON value containing spaces or quotes together:

```javascript
rules = await $("get /papi/v1/properties/prp_example/versions/1/rules")
```

```text
put -v "$rules" /papi/v1/properties/prp_example/versions/1/rules
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
    "groupId": "grp_example",
    "parentGroupId": "grp_parent",
    "contractIds": ["ctr_example"]
  }
]
akamai> get /papi/v1/properties groupId==grp_example
{
  "properties": {
    "items": [
      {
        "propertyId": "prp_example",
        "propertyName": "www.example.com",
        "latestVersion": 12
      }
    ]
  }
}
akamai> properties = await $("get /papi/v1/properties groupId==grp_example")
akamai> find /papi/v1/properties -q 'propertyName=~example'
[
  {
    "path": "/papi/v1/properties/prp_example",
    "resource": {
      "propertyId": "prp_example",
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
