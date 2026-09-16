'use strict';

function createScript(records) {
  const warnings = [];
  const requests = records.map((record, index) => ({
    sequence: record.sequence ?? index + 1,
    request: require('./trace').prepareRequest(record.request, warnings, index + 1),
    expectedStatusCode: record.response?.statusCode,
    recordedError: record.error?.message
  }));
  const warningText = warnings.length
    ? `\n// Warnings:\n${warnings.map((warning) => `// - ${warning}`).join('\n')}\n`
    : '';

  return `'use strict';

const os = require('node:os');
const EdgeGrid = require('akamai-edgegrid');

const edgerc = process.env.AKAMAI_EDGERC || \`\${os.homedir()}/.edgerc\`;
const section = process.env.AKAMAI_EDGERC_SECTION || 'default';
const client = new EdgeGrid({ path: edgerc, section });
const traces = ${JSON.stringify(requests, null, 2)};
${warningText}
function parseBody(body) {
  if (body === undefined || body === null || body === '') return body;
  try { return JSON.parse(body); } catch { return body; }
}

async function main() {
  let failed = false;
  for (const trace of traces) {
    try {
      const response = await client.send(trace.request);
      const result = {
        sequence: trace.sequence,
        statusCode: response.statusCode,
        body: parseBody(response.body)
      };
      console.log(JSON.stringify(result));
      if (trace.expectedStatusCode !== undefined &&
          response.statusCode !== trace.expectedStatusCode) {
        console.error(\`record \${trace.sequence}: expected status \${trace.expectedStatusCode}, got \${response.statusCode}\`);
        failed = true;
      }
    } catch (error) {
      console.error(\`record \${trace.sequence}: \${error.message}\`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
`;
}

module.exports = { createScript };
