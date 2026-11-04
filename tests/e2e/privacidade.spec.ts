import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { makeSyntheticPdf } from '../helpers/syntheticPdf';

test('depois de carregar, nenhuma requisição sai da própria origem, nem ao processar um PDF', async ({ page, baseURL }) => {
  const origem = new URL(baseURL!).origin;
  const requisicoes: string[] = [];
  page.on('request', (r) => requisicoes.push(r.url()));

  await page.goto('./');
  const pdf = await makeSyntheticPdf({ pages: 12, bytesPerPage: 1_000_000, withText: true });
  await page.getByLabel('Arquivo PDF').setInputFiles({ name: 'volume.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();

  const externas = requisicoes.filter((u) => !(u.startsWith(origem) || u.startsWith('blob:') || u.startsWith('data:')));
  expect(externas).toEqual([]);
});

test('a CSP bloqueia qualquer fetch, inclusive para fora', async ({ page }) => {
  await page.goto('./');
  const resultado = await page.evaluate(() =>
    fetch('https://example.com').then(
      () => 'saiu',
      () => 'bloqueado',
    ),
  );
  expect(resultado).toBe('bloqueado');
});

test('o index.html construído declara connect-src none e não permite eval nem recursos externos', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  expect(html).toContain("connect-src 'none'");
  expect(html).not.toContain('unsafe-eval');
  expect(html).not.toContain('unsafe-inline');
  expect(html).not.toMatch(/(src|href)="https?:\/\//); // sem scripts, estilos ou fontes de terceiros
});
