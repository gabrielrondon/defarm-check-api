import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/db/migrations/**',
        'src/types/**'
      ]
    },
    testTimeout: 30000, // 30 seconds for integration tests with geocoding
    hookTimeout: 30000,
    teardownTimeout: 10000,
    setupFiles: ['./src/tests/setup.ts']
  }
});
