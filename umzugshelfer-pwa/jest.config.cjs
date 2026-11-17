module.exports = {
  roots: ['<rootDir>/src'],
  testEnvironment: '<rootDir>/scripts/jest/environment.cjs',
  testEnvironmentOptions: { url: 'http://localhost', customExportConditions: ['node', 'node-addons'] },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testRegex: '\\.(test|spec)\\.[jt]sx?$',
  transform: { '^.+\\.[cm]?[jt]sx?$': 'babel-jest' },
  moduleNameMapper: {
    '\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    '\\.(css|sass|scss|less)$': '<rootDir>/scripts/jest/style-mock.cjs',
    '\\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|eot|mp3|wav)$': '<rootDir>/scripts/jest/file-mock.cjs',
  },
  // Router 8 ships ESM only; compile it and its ESM dependencies for existing CJS tests.
  transformIgnorePatterns: ['/node_modules/(?!(react-router|cookie-es|@remix-run/route-pattern)/)'],
  resetMocks: true,
  watchPathIgnorePatterns: ['<rootDir>/build/'],
};
