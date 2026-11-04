import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfInvalidoError, PdfProtegidoError, diagnose } from '../../src/pdf/diagnose';
import { encryptedMinimalPdf, signedLikePdf, unsignedSignatureFieldPdf } from '../helpers/fixtures';
import { makeSyntheticPdf } from '../helpers/syntheticPdf';

describe('diagnose: páginas e peso', () => {
  it('conta páginas e bytes totais', async () => {
    const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000 });
    const d = await diagnose(pdf);
    expect(d.paginas).toBe(3);
    expect(d.bytesTotal).toBe(pdf.length);
    expect(d.pesoPorPaginaEstimado).toHaveLength(3);
  });

  it('estima o peso de cada página', async () => {
    const pesos = [1_000, 500_000, 1_000];
    const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: (i) => pesos[i]! });
    const d = await diagnose(pdf);
    expect(d.pesoPorPaginaEstimado[1]).toBeGreaterThanOrEqual(500_000);
    expect(d.pesoPorPaginaEstimado[0]).toBeLessThan(50_000);
    expect(d.pesoPorPaginaEstimado[2]).toBeLessThan(50_000);
  });
});

describe('diagnose: texto pesquisável', () => {
  it("é 'sim' quando todas as páginas têm texto", async () => {
    const d = await diagnose(await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000, withText: true }));
    expect(d.textoPesquisavel).toBe('sim');
    expect(d.paginasComTexto).toBe(3);
  });

  it("é 'nao' quando nenhuma página tem texto", async () => {
    const d = await diagnose(await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000, withText: false }));
    expect(d.textoPesquisavel).toBe('nao');
    expect(d.paginasComTexto).toBe(0);
  });

  it("é 'parcial' quando só a página 0 tem texto", async () => {
    const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000, withText: (i) => i === 0 });
    const d = await diagnose(pdf);
    expect(d.textoPesquisavel).toBe('parcial');
    expect(d.paginasComTexto).toBe(1);
  });
});

describe('diagnose: arquivos problemáticos', () => {
  it('rejeita PDF protegido com PdfProtegidoError', async () => {
    await expect(diagnose(encryptedMinimalPdf())).rejects.toBeInstanceOf(PdfProtegidoError);
  });

  it('rejeita texto que não é PDF com PdfInvalidoError em português', async () => {
    const lixo = new TextEncoder().encode('isto nao e um pdf');
    await expect(diagnose(lixo)).rejects.toBeInstanceOf(PdfInvalidoError);
    await expect(diagnose(lixo)).rejects.toThrow(/PDF/);
  });

  it('rejeita arquivo vazio com PdfInvalidoError', async () => {
    await expect(diagnose(new Uint8Array())).rejects.toBeInstanceOf(PdfInvalidoError);
  });

  it('rejeita PDF truncado (só o cabeçalho) com PdfInvalidoError, sem vazar erro de biblioteca', async () => {
    const truncado = new TextEncoder().encode('%PDF-1.4\n');
    await expect(diagnose(truncado)).rejects.toBeInstanceOf(PdfInvalidoError);
    await expect(diagnose(truncado)).rejects.not.toThrow(/Cannot read|undefined|Expected instance/);
  });

  it('rejeita PDF cujo catálogo não tem árvore de páginas com PdfInvalidoError', async () => {
    const semPaginas = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Size 2 >>\n%%EOF\n',
    );
    await expect(diagnose(semPaginas)).rejects.toBeInstanceOf(PdfInvalidoError);
  });

  it('rejeita PDF de 0 páginas com PdfInvalidoError em português', async () => {
    // addDefaultPage: false, senão o pdf-lib insere uma página em branco ao salvar.
    const vazio = await (await PDFDocument.create()).save({ addDefaultPage: false });
    await expect(diagnose(vazio)).rejects.toBeInstanceOf(PdfInvalidoError);
    await expect(diagnose(vazio)).rejects.toThrow(/não tem páginas/);
  });
});

describe('diagnose: assinatura digital', () => {
  it('detecta PDF assinado', async () => {
    expect((await diagnose(await signedLikePdf())).possuiAssinaturaDigital).toBe(true);
  });

  it('não acusa assinatura em PDF comum', async () => {
    const d = await diagnose(await makeSyntheticPdf({ pages: 1, bytesPerPage: 1_000 }));
    expect(d.possuiAssinaturaDigital).toBe(false);
  });

  it('não acusa assinatura em campo de assinatura em branco', async () => {
    expect((await diagnose(await unsignedSignatureFieldPdf())).possuiAssinaturaDigital).toBe(false);
  });
});
