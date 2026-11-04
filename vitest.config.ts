import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Em Node (testes) o pdfjs-dist precisa do build "legacy".
    alias: [{ find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' }],
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
