import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    unstubEnvs: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
