import { defineConfig } from 'vitest/config';

/** Tests run against a throwaway database that is dropped and re-migrated on every run. */
export const TEST_DB_NAME = 'microbiology_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    // Every file shares the one test database.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DB_NAME: TEST_DB_NAME,
      JWT_SECRET: 'test-only-jwt-secret-0123456789-abcdefghij',
    },
  },
});
