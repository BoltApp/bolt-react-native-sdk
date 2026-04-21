/** @type {import('jest').Config} */
const config = {
  preset: '@react-native/jest-preset',
  modulePathIgnorePatterns: [
    '<rootDir>/example/node_modules',
    '<rootDir>/lib/',
  ],
  // `react-native-get-random-values` is a consumer peer dep with no JS API —
  // its side-effect import installs a polyfill via a TurboModule, neither of
  // which Jest needs. Stub it so tests don't require the package to be
  // installed in the root workspace.
  moduleNameMapper: {
    '^react-native-get-random-values$':
      '<rootDir>/src/__mocks__/react-native-get-random-values.js',
  },
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'junit.xml',
      },
    ],
  ],
};

module.exports = config;
