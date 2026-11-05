import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PerfilInvalidoError, estaDesatualizado, parsePerfil } from '../../src/profiles/parse';
import { carregarPerfis } from '../../src/profiles/load';
import { limiteEfetivoBytes, parteCumpre } from '../../src/profiles/rules';
import { validarPerfilComSchema } from '../../scripts/validate-profiles.mjs';

function lerJson(nome: string): any {
  return JSON.parse(readFileSync(new URL(`../../profiles/${nome}.json`, import.meta.url), 'utf8'));
}

const tjgoJson = () => lerJson('tjgo-projudi');
const trf1Json = () => lerJson('trf1-pje');
const tjgo = () => parsePerfil(tjgoJson());
const trf1 = () => parsePerfil(trf1Json());

// Casos inválidos compartilhados entre o validador de runtime e o JSON Schema (paridade).
const casosInvalidos: Array<[string, (p: any) => void]> = [
  ['fonte vazia', (p) => { p.fonte = ''; }],
  ['verificado_em ausente', (p) => { delete p.verificado_em; }],
  ['verificado_em fora de AAAA-MM-DD', (p) => { p.verificado_em = '02/11/2026'; }],
  ['tipo de restrição desconhecido', (p) => { p.restricoes.push({ tipo: 'inventada' }); }],
  ['nenhum tamanho_maximo_arquivo', (p) => {
    p.restricoes = p.restricoes.filter((r: any) => r.tipo !== 'tamanho_maximo_arquivo');
  }],
  ['dois tamanho_maximo_arquivo', (p) => {
    p.restricoes.push({ tipo: 'tamanho_maximo_arquivo', bytes: 1000 });
  }],
  ['bytes menor ou igual a zero', (p) => {
    p.restricoes.find((r: any) => r.tipo === 'tamanho_maximo_arquivo').bytes = 0;
  }],
];

describe('parsePerfil', () => {
  it('aceita os dois perfis reais', () => {
    expect(tjgo().id).toBe('tjgo-projudi');
    expect(trf1().id).toBe('trf1-pje');
  });

  it.each(casosInvalidos)('rejeita: %s', (_nome, mutar) => {
    const p = tjgoJson();
    mutar(p);
    expect(() => parsePerfil(p)).toThrow(PerfilInvalidoError);
  });

  it('rejeita data impossível, como 2026-02-31', () => {
    const p = tjgoJson();
    p.verificado_em = '2026-02-31';
    expect(() => parsePerfil(p)).toThrow(PerfilInvalidoError);
  });

  it('informa o caminho do campo na mensagem de erro', () => {
    const p = tjgoJson();
    p.fonte = '';
    expect(() => parsePerfil(p)).toThrow(/fonte/);
  });
});

describe('paridade com o JSON Schema', () => {
  it('o schema aceita os dois perfis reais', () => {
    expect(validarPerfilComSchema(tjgoJson())).toEqual([]);
    expect(validarPerfilComSchema(trf1Json())).toEqual([]);
  });

  it.each(casosInvalidos)('o schema rejeita: %s', (_nome, mutar) => {
    const p = tjgoJson();
    mutar(p);
    expect(validarPerfilComSchema(p).length).toBeGreaterThan(0);
  });
});

describe('carregarPerfis', () => {
  it('carrega os dois perfis reais, ordenados por id, sem o schema', () => {
    expect(carregarPerfis().map((p) => p.id)).toEqual(['tjgo-projudi', 'trf1-pje']);
  });
});

describe('estaDesatualizado', () => {
  const perfil = () => ({ ...tjgo(), verificado_em: '2026-11-02' });

  it('não marca como desatualizado no 180º dia', () => {
    expect(estaDesatualizado(perfil(), new Date(Date.UTC(2027, 4, 1)))).toBe(false);
  });

  it('marca como desatualizado no 181º dia', () => {
    expect(estaDesatualizado(perfil(), new Date(Date.UTC(2027, 4, 2)))).toBe(true);
  });
});

describe('limiteEfetivoBytes', () => {
  it('aplica 5% de margem ao TJGO', () => {
    expect(limiteEfetivoBytes(tjgo())).toBe(11953766);
  });

  it('aplica 5% de margem ao TRF1', () => {
    expect(limiteEfetivoBytes(trf1())).toBe(19922944);
  });
});

describe('parteCumpre (TJGO)', () => {
  it.each([
    [3_000_000, 1, true],
    [10_000_000, 3, false],
    [10_000_000, 6, true],
    [11_953_766, 100, true],
    [11_953_767, 100, false],
    [4_194_304, 1, true],
  ])('tamanho %i com %i página(s) → %s', (bytes, paginas, esperado) => {
    expect(parteCumpre(tjgo(), bytes, paginas)).toBe(esperado);
  });
});
