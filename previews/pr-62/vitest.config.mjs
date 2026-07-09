import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include:     ['**/*.test.mjs'],
    exclude:     ['node_modules/**', 'pod_modules/**'],
  },
});
