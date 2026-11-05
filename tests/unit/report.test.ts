import { describe, expect, it } from 'vitest';
import type { Diagnostico } from '../../src/pdf/diagnose';
import type { Parte } from '../../src/pdf/split';
import { FRASE_FIXA, gerarRelatorio } from '../../src/report/report';
import { carregarPerfis } from '../../src/profiles/load';
import type { Perfil } from '../../src/profiles/types';

const perfil = (id: string): Perfil => carregarPerfis().find((p) => p.id === id)!;
const tjgo = () => perfil('tjgo-projudi');
const trf1 = () => perfil('trf1-pje');

const AGORA = new Date(Date.UTC(2026, 10, 5));

function diagnostico(extra: Partial<Diagnostico> = {}): Diagnostico {
  return {
    paginas: 10,
    bytesTotal: 1000,
    pesoPorPaginaEstimado: [],
    paginasComTexto: 10,
    textoPesquisavel: 'sim',
    possuiAssinaturaDigital: false,
    ...extra,
  };
}

function parte(indice: number, paginas: number, bytes: number): Parte {
  const primeiraPagina = (indice - 1) * paginas + 1;
  return { indice, primeiraPagina, ultimaPagina: primeiraPagina + paginas - 1, bytes: new Uint8Array(bytes) };
}

function relatorio(p: Perfil, partes: Parte[], d: Diagnostico = diagnostico(), agora = AGORA) {
  return gerarRelatorio({ perfil: p, nomeBase: 'Volume', partes, diagnostico: d, agora });
}

describe('gerarRelatorio: partes', () => {
  it('nomeia as partes e conta as páginas de cada uma', () => {
    const r = relatorio(tjgo(), [parte(1, 10, 1_000), parte(2, 4, 1_000)]);
    expect(r.partes.map((p) => [p.nome, p.paginas, p.bytes])).toEqual([
      ['Volume_parte01de02.pdf', 10, 1_000],
      ['Volume_parte02de02.pdf', 4, 1_000],
    ]);
  });

  it('confere contra o limite declarado, sem a margem de 5%', () => {
    // 11_990_000 está entre o limite efetivo (11_953_766) e o declarado (12_582_912).
    expect(relatorio(tjgo(), [parte(1, 10, 11_990_000)]).partes[0]!.cumpre).toBe(true);
    expect(relatorio(tjgo(), [parte(1, 10, 12_600_000)]).partes[0]!.cumpre).toBe(false);
  });

  it('avisa quando alguma parte não cumpre o perfil', () => {
    const r = relatorio(tjgo(), [parte(1, 10, 12_600_000)]);
    expect(r.avisos.some((a) => a.includes('Volume_parte01de01.pdf'))).toBe(true);
  });
});

describe('gerarRelatorio: avisos', () => {
  it('avisa quando passa de 40 arquivos no TRF1, e não avisa com 40', () => {
    const muitas = Array.from({ length: 41 }, (_, i) => parte(i + 1, 1, 1_000));
    expect(relatorio(trf1(), muitas).avisos.some((a) => a.includes('40'))).toBe(true);
    expect(relatorio(trf1(), muitas.slice(0, 40)).avisos.some((a) => a.includes('40'))).toBe(false);
  });

  it('avisa sobre texto pesquisável no TRF1, mas não no TJGO', () => {
    const semTexto = diagnostico({ textoPesquisavel: 'nao', paginasComTexto: 0 });
    expect(relatorio(trf1(), [parte(1, 1, 1_000)], semTexto).avisos.some((a) => /pesquis/i.test(a))).toBe(true);
    expect(relatorio(tjgo(), [parte(1, 1, 1_000)], semTexto).avisos.some((a) => /pesquis/i.test(a))).toBe(false);
  });

  it('não avisa sobre texto quando todas as páginas têm texto', () => {
    expect(relatorio(trf1(), [parte(1, 1, 1_000)]).avisos).toEqual([]);
  });

  it('avisa que dividir invalida a assinatura digital', () => {
    const assinado = diagnostico({ possuiAssinaturaDigital: true });
    const r = relatorio(tjgo(), [parte(1, 1, 1_000)], assinado);
    expect(r.avisos.some((a) => /assinatura/i.test(a) && /invalida/i.test(a))).toBe(true);
  });
});

describe('gerarRelatorio: proveniência do perfil', () => {
  it('marca como desatualizado só depois de 180 dias (perfil verificado em 2026-11-02)', () => {
    const base = { ...tjgo(), verificado_em: '2026-11-02' };
    const em = (d: Date) => relatorio(base, [parte(1, 1, 1_000)], diagnostico(), d).desatualizado;
    expect(em(new Date(Date.UTC(2027, 4, 1)))).toBe(false);
    expect(em(new Date(Date.UTC(2027, 4, 2)))).toBe(true);
  });

  it('copia confiança, fonte, data, lembretes e a frase fixa do perfil', () => {
    const p = trf1();
    const r = relatorio(p, [parte(1, 1, 1_000)]);
    expect(r.perfilId).toBe('trf1-pje');
    expect(r.confianca).toBe(p.confianca);
    expect(r.fonte).toBe(p.fonte);
    expect(r.verificadoEm).toBe(p.verificado_em);
    expect(r.lembretes).toEqual(p.lembretes);
    expect(r.fraseFixa).toBe('Confira o limite na tela de envio do tribunal.');
    expect(FRASE_FIXA).toBe(r.fraseFixa);
  });
});
