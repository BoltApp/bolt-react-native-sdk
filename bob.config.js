/** @type {import('react-native-builder-bob').Config} */
const config = {
  source: 'src',
  output: 'lib',
  targets: [
    ['module', { esm: true }],
    ['typescript', { project: 'tsconfig.build.json' }],
  ],
};

module.exports = config;
