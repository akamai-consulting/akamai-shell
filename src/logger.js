'use strict';

const fs = require('fs');
const LEVELS = ['debug', 'info', 'warn', 'error'];
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|credential|api[-_]?key|access[-_]?key)/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).reduce((result, key) => {
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(value[key]);
    return result;
  }, {});
}

function createLogger(stream = process.stderr) {
  let currentStream = stream;
  let ownedStream;
  return {
    level: 'info',
    setLevel(level) {
      this.level = LEVELS.includes(level) ? level : 'info';
    },
    enabled(level) {
      return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
    },
    setOutput(destination) {
      let nextStream;
      if (destination === 'stderr') nextStream = process.stderr;
      else if (destination === 'stdout') nextStream = process.stdout;
      else {
        nextStream = fs.createWriteStream(destination, { flags: 'a', mode: 0o600 });
        ownedStream = nextStream;
      }
      if (ownedStream && ownedStream !== nextStream) ownedStream.end();
      currentStream = nextStream;
    },
    log(level, message, details) {
      if (!this.enabled(level)) return;
      const suffix = details === undefined ? '' : ` ${JSON.stringify(redact(details))}`;
      currentStream.write(`[${level.toUpperCase()}] ${message}${suffix}\n`);
    },
    debug(message, details) { this.log('debug', message, details); },
    info(message, details) { this.log('info', message, details); },
    warn(message, details) { this.log('warn', message, details); },
    error(message, details) { this.log('error', message, details); }
  };
}

module.exports = { LEVELS, createLogger, redact };
