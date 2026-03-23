#!/usr/bin/env node

/**
 * Injects telemetry config values into the BUILT output (lib/) after bob build.
 * Source files in src/ are never modified.
 *
 * Reads from:
 *   1. Environment variables (BOLT_OTLP_ENDPOINT, BOLT_OTLP_USERNAME, BOLT_OTLP_AUTH_TOKEN)
 *   2. .env file in the project root (fallback)
 *
 * Usage (in CI, after `yarn prepare`):
 *   node scripts/inject-telemetry-config.js
 *
 * In GitHub Actions, set BOLT_OTLP_ENDPOINT, BOLT_OTLP_USERNAME, and BOLT_OTLP_AUTH_TOKEN as secrets.
 * Raw credentials are never written to lib/ — only the pre-encoded base64 token is injected.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');

// Built JS output from bob
const BUILD_CONFIG = path.join(ROOT, 'lib', 'module', 'telemetry', 'config.js');

// Load .env file if it exists (simple key=value parser)
const loadDotEnv = () => {
  if (!fs.existsSync(ENV_FILE)) return;
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadDotEnv();

const endpoint = process.env.BOLT_OTLP_ENDPOINT;
const username = process.env.BOLT_OTLP_USERNAME;
const authToken = process.env.BOLT_OTLP_AUTH_TOKEN;

if (!username || !authToken) {
  console.warn(
    'WARNING: BOLT_OTLP_USERNAME or BOLT_OTLP_AUTH_TOKEN not set. Telemetry will use placeholder values.'
  );
  process.exit(0);
}

if (!fs.existsSync(BUILD_CONFIG)) {
  console.error(
    'ERROR: Built config not found at',
    BUILD_CONFIG,
    '— run `yarn prepare` first.'
  );
  process.exit(1);
}

let content = fs.readFileSync(BUILD_CONFIG, 'utf8');

if (endpoint) {
  content = content.replace(
    /https:\/\/otlp-gateway-prod-us-central-0\.grafana\.net\/otlp/g,
    endpoint
  );
}

// Pre-encode credentials so raw values are never present in the published bundle.
const encodedToken = require('buffer')
  .Buffer.from(`${username}:${authToken}`)
  .toString('base64');
content = content.replace(/__BOLT_OTLP_AUTH_TOKEN__/g, encodedToken);

fs.writeFileSync(BUILD_CONFIG, content, 'utf8');
console.log('Telemetry config injected into lib/ successfully.');
