import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
