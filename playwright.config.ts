import { defineConfig } from '@playwright/test';

const PORTA = 4173;

// Em Linux com locale ASCII (comum em containers) o Chromium descarta o acento do nome sugerido
// para download. Fixar UTF-8 torna o e2e igual em qualquer máquina; o site em si não depende disso.
const env =
  process.platform === 'linux'
    ? { ...(process.env as Record<string, string>), LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' }
    : undefined;

/** Opções do navegador de teste; os specs que precisam de flags extras partem delas. */
export const opcoesDoNavegador = {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  env,
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORTA}/doc-fracionado/`,
    actionTimeout: 15_000,
    // Ambientes com navegador pré-instalado definem o caminho do executável.
    launchOptions: opcoesDoNavegador,
  },
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORTA} --strictPort`,
    url: `http://127.0.0.1:${PORTA}/doc-fracionado/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
