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

test('a CSP vale também dentro dos workers que seguram o PDF (fetch bloqueado em cada um)', async ({ page }) => {
  // Um worker criado de uma URL http recebe a política dos cabeçalhos da própria resposta, e o
  // GitHub Pages não envia CSP: ele ficaria sem proteção. Workers criados de um blob: herdam a
  // CSP do documento. Este teste observa cada worker que a página cria, o do pdf.js inclusive.
  const observados: Array<{ url: string; fetch: string }> = [];
  const pendentes: Promise<void>[] = [];
  page.on('worker', (w) => {
    pendentes.push(
      (async () => {
        try {
          const fetch = await w.evaluate(() =>
            self.fetch('/doc-fracionado/index.html').then(
              () => 'saiu',
              () => 'bloqueado',
            ),
          );
          observados.push({ url: w.url(), fetch });
        } catch {
          // o worker terminou antes de responder
        }
      })(),
    );
  });

  await page.goto('./');
  const pdf = await makeSyntheticPdf({ pages: 40, bytesPerPage: 1_000_000, withText: true });
  await page.getByLabel('Arquivo PDF').setInputFiles({ name: 'volume.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await Promise.all(pendentes);

  expect(observados.length).toBeGreaterThan(0);
  expect(observados.filter((o) => !o.url.startsWith('blob:'))).toEqual([]); // todo worker herda a CSP
  expect(observados.filter((o) => o.fetch !== 'bloqueado')).toEqual([]);
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
