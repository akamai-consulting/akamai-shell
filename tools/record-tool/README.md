# record-tool

`record-tool` is a standalone prototype for turning `akamai-shell` recorder
JSONL into a runnable CommonJS Node.js script. It is intentionally separate
from the interactive shell.

## Usage

From the repository root:

```sh
node tools/record-tool/bin/record-tool.js create-script -f saved.jsonl
node tools/record-tool/bin/record-tool.js create-script -f saved.jsonl -o generated.js
```

The generated script reads credentials at execution time from
`AKAMAI_EDGERC` and `AKAMAI_EDGERC_SECTION`, defaulting to `~/.edgerc` and
`default`. It uses the installed `akamai-edgegrid` package to send the
recorded requests sequentially and reports response status and body.

Redacted request values are omitted from generated requests. The generator
prints warnings in the generated script when this makes a request incomplete.
It never embeds EdgeGrid secrets or signed authorization values.

This prototype generates code; it does not send requests while generating and
does not implement replay, package installation, or trace editing.
