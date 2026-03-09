import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/lock-add-locks.ts', 'src/lock-update-locks.ts', 'src/lock-status.ts', 'src/hash.ts'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
