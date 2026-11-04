import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { carregarPerfis } from '../../src/profiles/load';
import { parsePerfil } from '../../src/profiles/parse';
import { limiteEfetivoBytes, parteCumpre } from '../../src/profiles/rules';
import type { Perfil } from '../../src/profiles/types';
import { splitPdf, type Parte } from '../../src/pdf/split';
import {
  pdfWithDocMdpSignature,
  pdfWithInheritedMediaBox,
  pdfWithInternalLink,
  pdfWithMultiPageField,
  pdfWithOrphanStream,
} from '../helpers/fixtures';
import { makeSyntheticPdf, readPageWidths } from '../helpers/syntheticPdf';

function perfilComLimite(bytes: number): Perfil {
  return parsePerfil({
    id: 'teste',
    tribunal: 'T',
    sistema: 'S',
    restricoes: [{ tipo: 'tamanho_maximo_arquivo', bytes }],
    confianca: 'oficial',
    fonte: 'teste',
    verificado_em: '2026-11-04',
    observacoes: '',
    lembretes: [],
  });
}

const tjgo = () => carregarPerfis().find((p) => p.id === 'tjgo-projudi')!;

async function contarPaginas(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

async function larguraDasPartes(partes: Parte[]): Promise<number[]> {
  const todas: number[] = [];
  for (const p of partes) todas.push(...(await readPageWidths(p.bytes)));
  return todas;
}

async function dividirOuFalhar(origem: Uint8Array, perfil: Perfil, opts?: Parameters<typeof splitPdf>[2]) {
  const r = await splitPdf(origem, perfil, opts);
  if (!r.ok) throw new Error(`divisão falhou na página ${r.paginaProblematica}`);
  return r.partes;
}

describe('splitPdf: caso básico', () => {
  it('divide 10 páginas de 1 MB em 5 partes de 2 páginas, preservando a ordem', async () => {
    const perfil = perfilComLimite(3_000_000);
    const pdf = await makeSyntheticPdf({ pages: 10, bytesPerPage: 1_000_000 });
    const partes = await dividirOuFalhar(pdf, perfil);

    expect(partes).toHaveLength(5);
    for (const p of partes) expect(p.bytes.length).toBeLessThanOrEqual(limiteEfetivoBytes(perfil));
    expect(await Promise.all(partes.map((p) => contarPaginas(p.bytes)))).toEqual([2, 2, 2, 2, 2]);
    expect(await larguraDasPartes(partes)).toEqual([200, 201, 202, 203, 204, 205, 206, 207, 208, 209]);
  });

  it('numera as partes e as faixas de páginas (base 1)', async () => {
    const pdf = await makeSyntheticPdf({ pages: 10, bytesPerPage: 1_000_000 });
    const partes = await dividirOuFalhar(pdf, perfilComLimite(3_000_000));
    expect(partes.map((p) => [p.indice, p.primeiraPagina, p.ultimaPagina])).toEqual([
      [1, 1, 2],
      [2, 3, 4],
      [3, 5, 6],
      [4, 7, 8],
      [5, 9, 10],
    ]);
  });

  it('respeita o limite com páginas de pesos muito diferentes, sem perder nem reordenar páginas', async () => {
    const pesos = [400_000, 1_200_000, 300_000, 2_000_000, 100_000, 900_000, 900_000, 500_000];
    const perfil = perfilComLimite(3_000_000);
    const pdf = await makeSyntheticPdf({ pages: pesos.length, bytesPerPage: (i) => pesos[i]! });
    const partes = await dividirOuFalhar(pdf, perfil);

    for (const p of partes) expect(p.bytes.length).toBeLessThanOrEqual(limiteEfetivoBytes(perfil));
    expect(await larguraDasPartes(partes)).toEqual([200, 201, 202, 203, 204, 205, 206, 207]);
  });

  it('chama onProgresso com contagem crescente, terminando em total', async () => {
    const chamadas: Array<[number, number]> = [];
    const pdf = await makeSyntheticPdf({ pages: 10, bytesPerPage: 1_000_000 });
    await dividirOuFalhar(pdf, perfilComLimite(3_000_000), {
      onProgresso: (feito, total) => chamadas.push([feito, total]),
    });

    expect(chamadas.length).toBeGreaterThan(0);
    for (let i = 1; i < chamadas.length; i++) expect(chamadas[i]![0]).toBeGreaterThanOrEqual(chamadas[i - 1]![0]);
    expect(chamadas.at(-1)).toEqual([10, 10]);
  });
});

describe('splitPdf: limites e regras do perfil', () => {
  it('falha quando uma única página já excede o limite', async () => {
    const pdf = await makeSyntheticPdf({ pages: 1, bytesPerPage: 5_000_000 });
    const r = await splitPdf(pdf, perfilComLimite(3_000_000));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.paginaProblematica).toBe(1);
      expect(r.bytesDaPagina).toBeGreaterThanOrEqual(5_000_000);
    }
  });

  it('aponta a página pesada certa no meio do arquivo', async () => {
    const pdf = await makeSyntheticPdf({ pages: 4, bytesPerPage: (i) => (i === 2 ? 5_000_000 : 500_000) });
    const r = await splitPdf(pdf, perfilComLimite(3_000_000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.paginaProblematica).toBe(3);
  });

  it('aplica a regra de média por página do TJGO: 4 páginas de 2,5 MB viram 4 partes de 1 página', async () => {
    const pdf = await makeSyntheticPdf({ pages: 4, bytesPerPage: 2_500_000 });
    const partes = await dividirOuFalhar(pdf, tjgo());
    expect(await Promise.all(partes.map((p) => contarPaginas(p.bytes)))).toEqual([1, 1, 1, 1]);
  });

  it('TJGO: uma página pesada no fim é resolvida cedendo páginas leves da parte anterior (não pede compressão à toa)', async () => {
    // 10 páginas de 1,1 MB e uma de 5 MB. A página 11 sozinha viola a média (5 MB > 2 MB), mas
    // junto de 4 páginas leves a média cai para ~1,9 MB e cumpre: [1-6] [7-11].
    const pesos = [...Array(10).fill(1_100_000), 5_000_000];
    const pdf = await makeSyntheticPdf({ pages: 11, bytesPerPage: (i) => pesos[i]! });
    const partes = await dividirOuFalhar(pdf, tjgo());

    for (const p of partes) {
      expect(parteCumpre(tjgo(), p.bytes.length, p.ultimaPagina - p.primeiraPagina + 1)).toBe(true);
    }
    expect(partes.map((p) => p.indice)).toEqual(partes.map((_, i) => i + 1));
    expect(await larguraDasPartes(partes)).toEqual(Array.from({ length: 11 }, (_, i) => 200 + i));
  });

  it('TJGO: continua falhando quando não existe divisão válida (página pesada logo depois de uma só página leve)', async () => {
    // [1,1 MB] [5 MB]: juntas dão média de 3 MB, e a de 5 MB sozinha dá 5 MB. Sem solução.
    const pdf = await makeSyntheticPdf({ pages: 2, bytesPerPage: (i) => (i === 0 ? 1_100_000 : 5_000_000) });
    const r = await splitPdf(pdf, tjgo());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.paginaProblematica).toBe(2);
  });

  it('falha no TJGO quando uma página sozinha viola a média (5 MB numa página)', async () => {
    const pdf = await makeSyntheticPdf({ pages: 1, bytesPerPage: 5_000_000 });
    const r = await splitPdf(pdf, tjgo());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.paginaProblematica).toBe(1);
  });
});

describe('splitPdf: entrada inválida', () => {
  it('rejeita PDF sem páginas em vez de devolver uma divisão vazia', async () => {
    const vazio = await (await PDFDocument.create()).save({ addDefaultPage: false });
    await expect(splitPdf(vazio, perfilComLimite(3_000_000))).rejects.toThrow(/não tem páginas/);
  });
});

describe('splitPdf: PDF que já cabe', () => {
  it('devolve uma única parte idêntica ao original, sem reserializar, e diz que é o original', async () => {
    const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000 });
    const r = await splitPdf(pdf, perfilComLimite(3_000_000));
    if (!r.ok) throw new Error('falhou');
    expect(r.original).toBe(true);
    expect(r.partes).toHaveLength(1);
    expect(r.partes[0]!.bytes).toEqual(pdf);
    expect([r.partes[0]!.indice, r.partes[0]!.primeiraPagina, r.partes[0]!.ultimaPagina]).toEqual([1, 1, 3]);
  });

  it('original grande demais que só cabe regravado: parte única que NÃO é o original', async () => {
    const pdf = await pdfWithOrphanStream();
    const perfil = tjgo();
    expect(pdf.length).toBeGreaterThan(12_582_912); // o original excede até o limite declarado

    const r = await splitPdf(pdf, perfil);
    if (!r.ok) throw new Error(`falhou na página ${r.paginaProblematica}`);

    expect(r.partes).toHaveLength(1);
    expect(r.original).toBe(false);
    expect(r.partes[0]!.bytes.length).toBeLessThan(pdf.length);
    expect(r.partes[0]!.bytes.length).toBeLessThanOrEqual(limiteEfetivoBytes(perfil));
    expect(await contarPaginas(r.partes[0]!.bytes)).toBe(10);
  });

  it('dividido em várias partes nunca é "original"', async () => {
    const pdf = await makeSyntheticPdf({ pages: 10, bytesPerPage: 1_000_000 });
    const r = await splitPdf(pdf, perfilComLimite(3_000_000));
    expect(r.ok && r.original).toBe(false);
  });
});

describe('splitPdf: o que não pode contaminar as partes', () => {
  it('não deixa um link interno arrastar outra página para dentro da parte', async () => {
    const perfil = perfilComLimite(3_000_000);
    const partes = await dividirOuFalhar(await pdfWithInternalLink(), perfil);

    expect(await Promise.all(partes.map((p) => contarPaginas(p.bytes)))).toEqual([2, 2, 2]);
    // Uma página arrastada pelo link somaria ~1 MB a uma parte de ~2 MB.
    for (const p of partes) expect(p.bytes.length).toBeLessThan(2_300_000);
  });

  it('não deixa um campo de formulário multipágina arrastar as outras páginas', async () => {
    const partes = await dividirOuFalhar(await pdfWithMultiPageField(), perfilComLimite(3_000_000));
    expect(await Promise.all(partes.map((p) => contarPaginas(p.bytes)))).toEqual([2, 2, 2]);
    for (const p of partes) expect(p.bytes.length).toBeLessThan(2_300_000);
  });

  it('não deixa uma assinatura DocMDP (/Reference /Data → catálogo) arrastar o documento inteiro', async () => {
    const partes = await dividirOuFalhar(await pdfWithDocMdpSignature(), perfilComLimite(3_000_000));
    expect(await Promise.all(partes.map((p) => contarPaginas(p.bytes)))).toEqual([2, 2, 2]);
    for (const p of partes) expect(p.bytes.length).toBeLessThan(2_300_000);
  });

  it('preserva o MediaBox herdado do nó Pages em todas as partes', async () => {
    const origem = await pdfWithInheritedMediaBox();
    // Garante que o fixture é o que diz ser: nenhuma folha tem MediaBox próprio.
    const folhas = (await PDFDocument.load(origem)).getPages();
    expect(folhas.every((p) => p.node.get(PDFName.of('MediaBox')) === undefined)).toBe(true);

    const partes = await dividirOuFalhar(origem, perfilComLimite(250_000));

    expect(partes.length).toBeGreaterThan(1);
    expect(await larguraDasPartes(partes)).toEqual(await readPageWidths(origem));
  });
});
