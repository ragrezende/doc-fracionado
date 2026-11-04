import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { encryptedMinimalPdf } from '../helpers/fixtures';
import { makeSyntheticPdf, readPageWidths } from '../helpers/syntheticPdf';

/**
 * Arquivo em memória, sem passar por caminho em disco: o upload por caminho com acento no diretório
 * (que o Playwright deriva do título do teste) não chega ao navegador em ambientes com locale C.
 */
function arquivo(nome: string, bytes: Uint8Array) {
  return { name: nome, mimeType: 'application/pdf', buffer: Buffer.from(bytes) };
}

async function abrir(page: Page, perfil: string): Promise<string[]> {
  const violacoesDeCsp: string[] = [];
  page.on('console', (m) => {
    if (/content security policy|refused to/i.test(m.text())) violacoesDeCsp.push(m.text());
  });
  await page.goto('./');
  await page.getByLabel('Perfil do tribunal').selectOption(perfil);
  return violacoesDeCsp;
}

const FRASE_FIXA = 'Confira o limite na tela de envio do tribunal.';

test('divide um volume de 12 MB no Projudi-TJGO e baixa o ZIP com as páginas em ordem', async ({ page }) => {
  const violacoesDeCsp = await abrir(page, 'tjgo-projudi');
  const pdf = await makeSyntheticPdf({ pages: 12, bytesPerPage: 1_000_000, withText: true });

  // Nome com acento, espaço e extensão em maiúsculas: o caso real mais provável de dar errado.
  await page.getByLabel('Arquivo PDF').setInputFiles(arquivo('Petição inicial.PDF', pdf));

  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
  await expect(page.getByText(FRASE_FIXA)).toBeVisible();
  await expect(page.getByText('Notícia, não oficial')).toBeVisible();
  await expect(page.getByText('Verificado em 02/11/2026')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ZIP' }).click();
  const baixado = await download;
  expect(baixado.suggestedFilename()).toBe('Petição inicial_partes.zip');
  const zip = unzipSync(readFileSync((await baixado.path())!));

  const nomes = ['Petição inicial_parte01de02.pdf', 'Petição inicial_parte02de02.pdf'];
  expect(Object.keys(zip)).toEqual(nomes);
  const larguras = [...(await readPageWidths(zip[nomes[0]!]!)), ...(await readPageWidths(zip[nomes[1]!]!))];
  expect(larguras).toEqual(Array.from({ length: 12 }, (_, i) => 200 + i));
  expect(violacoesDeCsp).toEqual([]); // pdf.js e o worker rodam sob a CSP sem nenhuma violação
});

test('PDF que já cabe: diz que já cumpre e oferece o original sem alterações', async ({ page }) => {
  await abrir(page, 'tjgo-projudi');
  const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000 });
  await page.getByLabel('Arquivo PDF').setInputFiles(arquivo('pequeno.pdf', pdf));

  await expect(page.getByText('já cumpre o perfil')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar ZIP' })).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar o PDF original' }).click();
  expect(new Uint8Array(readFileSync((await (await download).path())!))).toEqual(pdf);
});

test('PDF protegido: mostra o aviso e nenhum botão de download', async ({ page }) => {
  await abrir(page, 'tjgo-projudi');
  await page.getByLabel('Arquivo PDF').setInputFiles(arquivo('protegido.pdf', encryptedMinimalPdf()));

  await expect(page.getByRole('alert')).toContainText('protegido');
  await expect(page.getByRole('button', { name: /Baixar/ })).toHaveCount(0);
});

test('arquivo que não é PDF: mensagem clara', async ({ page }) => {
  await abrir(page, 'tjgo-projudi');
  await page.getByLabel('Arquivo PDF').setInputFiles(arquivo('lixo.pdf', new TextEncoder().encode('isto nao e um pdf')));

  await expect(page.getByRole('alert')).toContainText('não é um PDF válido');
});

test('trocar de arquivo durante o processamento descarta o resultado do anterior', async ({ page }) => {
  await abrir(page, 'tjgo-projudi');
  const grande = arquivo('grande.pdf', await makeSyntheticPdf({ pages: 40, bytesPerPage: 1_000_000 }));
  const pequeno = arquivo('pequeno.pdf', await makeSyntheticPdf({ pages: 2, bytesPerPage: 1_000 }));

  const entrada = page.getByLabel('Arquivo PDF');
  await entrada.setInputFiles(grande);
  await entrada.setInputFiles(pequeno);

  await expect(page.getByText('já cumpre o perfil')).toBeVisible();
  await page.waitForTimeout(2_000); // tempo de sobra para o resultado atrasado do arquivo grande aparecer, se vazasse
  await expect(page.getByText('pequeno.pdf')).toBeVisible();
  await expect(page.getByText('grande.pdf')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Baixar ZIP' })).toHaveCount(0);
});

test('sem rede depois de carregar, o worker não baixa: a mensagem é clara e não diz "undefined"', async ({ page, context }) => {
  await abrir(page, 'tjgo-projudi');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);

  const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000 });
  await page.getByLabel('Arquivo PDF').setInputFiles(arquivo('pequeno.pdf', pdf));

  const alerta = page.getByRole('alert');
  await expect(alerta).toContainText('Não foi possível processar o arquivo.');
  await expect(alerta).not.toContainText('undefined');
});

test('trocar o perfil reprocessa o mesmo arquivo com o limite do novo perfil', async ({ page }) => {
  await abrir(page, 'tjgo-projudi');
  const pdf = await makeSyntheticPdf({ pages: 12, bytesPerPage: 1_000_000 });
  await page.getByLabel('Arquivo PDF').setInputFiles(arquivo('volume.pdf', pdf));
  await expect(page.getByRole('button', { name: 'Baixar ZIP' })).toBeVisible(); // 12 MB não cabe em 12 MB menos 5%

  await page.getByLabel('Perfil do tribunal').selectOption('trf1-pje'); // limite de 20 MB
  await expect(page.getByText('já cumpre o perfil')).toBeVisible();
});
