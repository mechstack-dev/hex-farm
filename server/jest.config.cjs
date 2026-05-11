module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^common$': '<rootDir>/../common/src/index.ts',
    '^common/src/(.*)\\.js$': '<rootDir>/../common/src/$1.ts',
  },
};
