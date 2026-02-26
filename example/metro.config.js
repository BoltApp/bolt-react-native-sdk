const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');
const exclusionList =
  require('metro-config/private/defaults/exclusionList').default;

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
});

// Yarn workspaces hoists all packages to the root node_modules.
// Tell Metro to look there when example/node_modules doesn't exist.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, '..', 'node_modules'),
];

// When all peer deps share the same node_modules (e.g. a single-package monorepo),
// withMetroConfig sets resolver.blockList to [] (empty array). Metro's internal
// getIgnorePattern() converts that to /(?:)/ which matches every path, causing
// metro-file-map to exclude all files from its index. Normalize it to a proper RegExp.
const blockListPatterns = []
  .concat(config.resolver?.blockList || [])
  .filter(Boolean);
config.resolver.blockList = exclusionList(blockListPatterns);

module.exports = config;
