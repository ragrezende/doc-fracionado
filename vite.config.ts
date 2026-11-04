import { defineConfig } from 'vite';

export default defineConfig({
  // O site é publicado em https://<usuário>.github.io/doc-fracionado/
  base: '/doc-fracionado/',
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
