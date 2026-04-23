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

// Yarn workspaces hoists shared packages to the root node_modules, but packages
// the example installs exclusively (e.g. `react-native-get-random-values`,
// which must be a top-level dep for RN autolinking to register its native
// module) stay in example/node_modules. The SDK source at ../src imports those
// packages, and Metro resolves from the importing file's location — so we need
// both paths here.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
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
