import { expect, test } from '@playwright/test';
import { opcoesDoNavegador } from '../../playwright.config';
import { makeSyntheticPdf } from '../helpers/syntheticPdf';

// Simula um Chrome/Edge anterior à versão 128, que não tem `Promise.try`. O build moderno do pdf.js
// usa essa função; em escritório com TI travada o navegador pode estar assim.
// A flag muda de nome entre versões do V8; as duas grafias são tentadas e o Chromium ignora a que não conhece.
test.use({ launchOptions: { ...opcoesDoNavegador, args: ['--js-flags=--no-js-promise-try --no-harmony-promise-try'] } });

test('sem Promise.try (navegador mais antigo) o processamento ainda funciona, inclusive o texto pesquisável', async ({ page }) => {
  await page.goto('./');
  const aindaTemPromiseTry = (await page.evaluate(() => typeof (Promise as unknown as { try?: unknown }).try)) !== 'undefined';
  // Se este Chromium ignora a flag, não há navegador antigo para simular: o que falharia seria a simulação,
  // não a ferramenta. Pular, com o motivo visível no relatório, em vez de reprovar ou de passar sem testar.
  test.skip(aindaTemPromiseTry, 'este Chromium ignora a flag do V8 que remove Promise.try; a simulação não vale aqui');

  const pdf = await makeSyntheticPdf({ pages: 12, bytesPerPage: 1_000_000, withText: true });
  await page.getByLabel('Arquivo PDF').setInputFiles({ name: 'volume.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });

  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await expect(page.getByText('Texto pesquisável')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
