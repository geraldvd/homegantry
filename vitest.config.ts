import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    unstubEnvs: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      // Process entrypoint (listen + start watching); everything it wires up is tested via createApp().
      exclude: ['server/index.ts'],
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
