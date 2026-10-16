# Akamai Shell

`akamai-shell` is an interactive JavaScript-enabled console for calling
Akamai APIs directly. Requests use EdgeGrid authentication, API paths and
methods are checked against the checked-in OpenAPI documents, and responses
can be inspected, transformed, stored in variables, and reused.

![Akamai Shell terminal demo](doc/asset/demo-ttyrec.gif)

It is useful when you need to:

- Explore Akamai resources interactively without writing a client program.
- Reuse response data such as property IDs, versions, groups, and hostnames.
- Combine API calls with JavaScript expressions and local shell tools such as
  `jq`.
- Use the same generic request path for normal commands and tab completion.
- Record redacted HTTP exchanges while developing or troubleshooting scripts.

Supported methods and paths vary by API module; unsupported combinations fail
explicitly.

## Get started

Requirements:

- Node.js
- An EdgeGrid resource file, normally `~/.edgerc`

Clone the repository with its API reference submodule and install dependencies:

```bash
git clone --recurse-submodules https://github.com/tai/akamai-shell.git
cd akamai-shell
npm install
npm start
```

For an existing checkout:

```bash
git submodule update --init --recursive
```

The executable can also be installed from the checkout:

```bash
npm install -g .
akamai-shell
```

Set the credential file and selected EdgeGrid section:

```text
akamai> set edgerc ~/.edgerc
akamai> set edgercSection papi
```

Set request context either with structured dotted settings or the shorthand
fields:

```text
akamai> set target.accountSwitchKey B-C-YOUR-ACCOUNT-SWITCH-KEY
akamai> set target.contractId ctr_YOUR_CONTRACT_ID
akamai> set target.groupId grp_YOUR_GROUP_ID
```

The `config` value is an ordinary JavaScript dictionary. Use `show config` to
inspect the current non-sensitive settings. Credentials, authorization
headers, and other secret-bearing values are not displayed or persisted.
Identifiers containing `YOUR_` in this guide are placeholders; replace them
with identifiers from your own account.

Make a first request:

```text
akamai> get /papi/v1/properties
```

Press Tab while entering a command for completion. Type `?` in an API command
for contextual parameter help.

## Running scripts

Run a script file through the shell:

```bash
akamai-shell script-file
```

An executable script may use the shell's shebang:

```bash
#!/usr/bin/env akamai-shell
value = 123
echo $value
```

Make it executable with `chmod +x script-file` and run it directly. Arguments
after the script path are available through the normal Node.js interface:

```bash
akamai-shell script.as foo bar
```

`process.argv[2]` is `foo` and `process.argv[3]` is `bar`. Script execution
returns status 0 for normal completion or explicit `exit`/`quit`, and a
non-zero status for command failures, unreadable files, malformed input, or
unterminated statements.

Script files use the same command parser, API dispatcher, JavaScript session,
variables, pipelines, request options, and error handling as interactive use.
They do not automatically save changes made during execution; use `save` when
a script needs to write state.

In non-interactive script mode, JavaScript evaluation results are suppressed by
default. Set `config.verbose = true` in the script to display them; explicit
`console.log()` output and shell-command output are always displayed.

## Configuration and session state

There are three related kinds of state:

1. `config` is the live runtime configuration dictionary. It contains settings
   such as `edgerc`, `edgercSection`, `target`, `timeout`, and recording
   options. It can also be read or changed with normal JavaScript.
2. `set` is the concise command interface for known configuration values.
   Scalar settings use `set name value`; structured settings use dotted paths,
   such as `set target.contractId ctr_YOUR_CONTRACT_ID`. The existing
   `set accountSwitchKey`, `set contractId`, and `set groupId` forms update
   the corresponding fields under `config.target` as shorthand.
3. User-defined JavaScript variables and functions live in the current backend
   session. They can be written to or loaded from an executable JavaScript
   state file.

Examples:

```text
set edgerc ~/.edgerc
set edgercSection papi
set target.accountSwitchKey B-C-YOUR-ACCOUNT-SWITCH-KEY
set target.contractId ctr_YOUR_CONTRACT_ID
set target.groupId grp_YOUR_GROUP_ID
set timeout.default 15000
show config
```

`save [file]` writes the current persistable user variables, functions, and
configuration as executable JavaScript. With no path, it uses
`~/.config/akamai-shell/state.js`. `load [file]` evaluates a saved state file
in the current session and then synchronizes the live configuration; with no
path it loads that default `state.js`.

`~/.config/akamai-shell/startup.js` is the only file loaded automatically when
the backend starts. It is intended for defaults, helper functions, or initial
configuration. An explicit `load` command can load `state.js` or another file
after startup and can therefore override values established by `startup.js`.
Neither `save` nor `load` copies credential secrets into output; use normal
file permissions for files containing sensitive configuration.

The `show` command displays the session namespace or one expression:

```text
show
show config
show properties.groups.items
```

## JavaScript integration

Input that is not a recognized shell command is evaluated as JavaScript in the
current session. Assignments, expressions, arrays, objects, properties,
indices, filters, functions, and console methods are supported:

```javascript
groups = await $("get /papi/v1/groups")
matching = groups.groups.items.filter(group =>
  group.groupName.includes("production")
)
```

The `$()` helper runs an internal shell command and returns its decoded result
without printing the nested command output. It can run API commands or local
shell pipelines:

```javascript
properties = await $(`get /papi/v1/properties | jq '.properties.items[]'`)
contents = await $('! cat data.json')
```

Interactive and script execution have one important difference: interactive
`$()` substitutions are automatically awaited, while script-mode `$()` keeps
its Promise semantics. Use explicit top-level `await` in scripts when the
result is needed immediately:

```javascript
properties = await $("get /papi/v1/properties")
```

JavaScript values can be used in later requests:

```text
put -v "$rules" /papi/v1/properties/prp_YOUR_PROPERTY_ID/versions/1/rules
get /papi/v1/properties/$properties["properties"]["items"][0]["propertyId"]
```

Add a semicolon to suppress the displayed result of a JavaScript statement:

```text
value = 123;
```

Script files support multi-line JavaScript statements. Consecutive lines are
joined until brackets, braces, parentheses, and quotes are balanced:

```javascript
data = []
for (let i = 0; i < 100; i++) {
  data[i] = await $('get /papi/v1/properties')
}
show data
```

The interactive prompt evaluates one entered line at a time; it does not
provide script-style multi-line accumulation or a continuation prompt.

Lines whose trimmed content starts with `#` are skipped as comments in script
files. This is script-only syntax. At the interactive prompt, input is
JavaScript, so `# comment` is not a comment and will produce a JavaScript
error.

## JavaScript and Node.js

The shell provides a persistent Node.js CommonJS JavaScript session. It is
trusted local code, so `require()` can expose filesystem, subprocess, and
network capabilities. The application architecture and implementation
boundaries are documented in [`DESIGN.md`](DESIGN.md).

Available Node.js features include:

- `process`, including `process.argv` during script execution
- CommonJS `require()`
- `Buffer`, `URL`, `URLSearchParams`, `AbortController`, `Blob`,
  `FormData`, `Headers`, `Request`, `Response`, timers, `structuredClone`,
  `performance`, and `fetch` when supported by the installed Node.js version
- `global`, which aliases the backend's `globalThis`

`require()` resolves relative files and `node_modules` from the script file's
directory in script mode, and from the shell's current working directory in
interactive mode. Loaded modules are runtime values and are not persisted as
session state. The shell does not install packages automatically.

Static ESM `import` syntax and dynamic `import()` are not supported.
CommonJS `require()` is the supported module-loading mechanism.

## Command reference

### API requests

| Command | Behavior |
| --- | --- |
| `get <api-path> [arguments ...]` | Authenticated GET with optional query parameters and headers. |
| `get -f <file> <api-path> ...` | Write formatted response JSON to `<file>` instead of the terminal. |
| `post <api-path> [arguments ...]` | Authenticated JSON POST. |
| `put <api-path> [arguments ...]` | Authenticated JSON PUT. |
| `post or put -f <file> <api-path> ...` | Load an object body from `<file>`; inline fields override file fields. |
| `post or put -v <expression> <api-path> ...` | Use any JavaScript value as the JSON body; inline fields merge over an object value. |
| `find <api-path> -q <rule>` | Fetch one collection response and find matching dictionaries locally. |

HTTPie-style arguments use these operators:

```text
name==value       query parameter
name=value        string JSON body field
name:=value       JSON-decoded body field
Name:Value        HTTP request header
```

Quote a header argument when its value contains spaces. Custom headers override
the corresponding default header case-insensitively while preserving unrelated
API-specific headers. CPS requests choose an operation-specific `Accept` value
from the OpenAPI response media types by default; for CPS input-info paths, the
newest compatible type is selected from the final path segment.

For example:

```text
get /papi/v1/properties groupId==grp_YOUR_GROUP_ID
get /cps/v2/enrollments 'Accept: application/vnd.akamai.cps.enrollments.v11+json'
post /edge-diagnostics/v1/curl url=https://example.test timeout:=30 enabled:=true
put -v "$payload" /some/path name=updated
```

API paths include their service prefix:

```text
get /papi/v1/properties
get /cloudlets/v3/policies/YOUR_POLICY_ID/versions
get /edge-diagnostics/v1/curl
```

### Session and local commands

| Command | Behavior |
| --- | --- |
| `set <name> <value>` | Set a known scalar setting. |
| `set <object>.<property> <value>` | Set a value in a structured setting, such as `set target.groupId grp_YOUR_GROUP_ID`. |
| `show [expression]` | Display the session namespace or one expression. |
| `echo <text> [\| command]` | Print expanded text and optionally pipe it to a local command. |
| `! <command>` or `!<command>` | Run a local shell command. |
| `history` | Show a numbered command history; it can be piped. |
| `record auto\|on\|off` | Control redacted in-memory request recording. `auto` keeps the latest request. |
| `record show [--http]` | Display captured JSONL or HTTP-style records. |
| `save [file]` | Save persistable session variables, functions, and configuration as JavaScript. |
| `load [file]` | Evaluate a state file in the current session. |
| `version` | Show the package version and the git commit hash of the running code. |
| `help` or `?` | Display built-in command help. |
| `exit` or `quit` | Leave the shell. |

Commands can be piped to local programs:

```text
get /papi/v1/properties | jq '.properties.items[]'
record show --http | head -20
history | grep properties
```

## Completion and contextual help

Tab completion is available in the interactive prompt and uses the current
session, OpenAPI metadata, configured API modules, `PATH`, and the current
working directory.

API and command completion includes:

- Command names and HTTP methods.
- Static API path segments and service prefixes.
- Dynamic identifiers fetched from collection endpoints, such as properties,
  versions, edge hostnames, and policy IDs.
- Query parameters and write-body fields with the correct operator:
  `name==`, `name=`, or `name:=`.
- Paths containing variables, while preserving the original variable syntax.
- `post` and `put` descendants where the API metadata supports them.

JavaScript and configuration completion includes:

- Session variables and function names.
- Object keys, array indices, properties, and `show` expressions.
- Structured settings such as `set target.<TAB>`.
- A trailing `.` for an exact object-valued key and a trailing space for an
  exact scalar leaf.

Shell completion includes executable names from `PATH` at command positions
and files/directories relative to the current working directory:

```text
! cat ./dat<TAB>
get /papi/v1/properties | jq ./scripts/<TAB>
```

Completion also works after leading whitespace. Failed or empty dynamic
lookups remain silent.

Type `?` in an API command to show the parameters supported at the current
position. The help is derived from the applicable OpenAPI operation, includes
short descriptions, and distinguishes query fields from string and typed JSON
body fields:

```text
get /papi/v1/properties ?
post /edge-diagnostics/v1/curl url=https://example.test ?
put /papi/v1/properties/prp_YOUR_PROPERTY_ID/versions/1/rules createFromVersion:?
```

The question mark is consumed only in a recognized API-help context. A
question mark inside quotes remains literal, and the input buffer is preserved
while help is displayed.

## Recording and history

`record auto` is the default and retains the latest completed redacted
request, including failures. `record on` retains all redacted records for the
session, and `record off` disables recording. `record show` emits JSONL;
`record show --http` emits an HTTP-style trace.

History is stored locally with restrictive permissions and is displayed as a
numbered list. Ctrl+R starts reverse incremental history search; accept a
match with the normal readline editing keys before executing it.

## Development

Run the complete test suite with:

```bash
npm test
```

The executable entry point is `src/main.js`. API-specific behavior lives in
modules under `src/apis/`; generic transport, request parsing, completion, and
JavaScript session behavior live in `src/`.
