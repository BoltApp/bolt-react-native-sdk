#!/usr/bin/env node

/**
 * Syncs src/telemetry/sdkVersion.ts with the version in package.json.
 * Run automatically as part of `yarn prepare` so the compiled lib
 * always embeds the correct version.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { version } = require(path.join(ROOT, 'package.json'));
const OUT = path.join(ROOT, 'src', 'telemetry', 'sdkVersion.ts');

const content = `// Auto-updated by scripts/update-sdk-version.js during release. Do not edit manually.\nexport const SDK_VERSION = '${version}';\n`;

fs.writeFileSync(OUT, content, 'utf8');
console.log(`SDK_VERSION set to ${version}`);
