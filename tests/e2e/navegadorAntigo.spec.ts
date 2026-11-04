import { expect, test } from '@playwright/test';
import { opcoesDoNavegador } from '../../playwright.config';
import { makeSyntheticPdf } from '../helpers/syntheticPdf';

// Simula um Chrome/Edge anterior à versão 128, que não tem `Promise.try`. O build moderno do pdf.js
// usa essa função; em escritório com TI travada o navegador pode estar assim.
test.use({ launchOptions: { ...opcoesDoNavegador, args: ['--js-flags=--no-js-promise-try'] } });

test('sem Promise.try (navegador mais antigo) o processamento ainda funciona, inclusive o texto pesquisável', async ({ page }) => {
  await page.goto('./');
  expect(await page.evaluate(() => typeof (Promise as unknown as { try?: unknown }).try)).toBe('undefined'); // a simulação vale

  const pdf = await makeSyntheticPdf({ pages: 12, bytesPerPage: 1_000_000, withText: true });
  await page.getByLabel('Arquivo PDF').setInputFiles({ name: 'volume.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });

  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await expect(page.getByText('Texto pesquisável')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
