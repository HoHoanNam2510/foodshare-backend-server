import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/seeds/**',
    '!src/__tests__/**',
    '!src/server.ts',
  ],
  coverageThreshold: {
    global: { branches: 40, lines: 50, functions: 50 },
  },
};

export default config;
