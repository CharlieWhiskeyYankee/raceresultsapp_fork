import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',  // 'jsdom' if you want DOM tests later
  },
});