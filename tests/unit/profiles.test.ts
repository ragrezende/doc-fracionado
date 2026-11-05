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
  it('carrega os perfis reais, ordenados por id, sem o schema', () => {
    expect(carregarPerfis().map((p) => p.id)).toEqual([
      'tjgo-projudi',
      'tjsp-eproc',
      'tjsp-esaj',
      'trf1-pje',
      'trt-pje-jt',
    ]);
  });
});

describe('perfis de TJSP e TRTs: valores lidos nas fontes e ressalvas que não podem sumir', () => {
  const perfil = (id: string) => carregarPerfis().find((p) => p.id === id)!;
  const tamanho = (id: string) => {
    const r = perfil(id).restricoes.find((x) => x.tipo === 'tamanho_maximo_arquivo');
    return r && r.tipo === 'tamanho_maximo_arquivo' ? r.bytes : undefined;
  };

  it('TRTs · PJe-JT: 10 MB por PDF (Ato Conjunto 48/2021, art. 1º), vale para todos os regionais', () => {
    const p = perfil('trt-pje-jt');
    expect(tamanho('trt-pje-jt')).toBe(10 * 1_048_576);
    expect(limiteEfetivoBytes(p)).toBe(9_961_472);
    expect(p.confianca).toBe('oficial');
    expect(p.tribunal).toMatch(/TRTs/);
    expect(p.observacoes).toMatch(/48\/2021/);
    expect(p.observacoes).toMatch(/89/); // o Ato 89/2017 (3 MB) foi revogado: o perfil registra isso
    expect(p.observacoes).toMatch(/revog/i);
  });

  it('TRTs · PJe-JT: não inventa limite de quantidade de arquivos que o ato não fixa', () => {
    expect(perfil('trt-pje-jt').restricoes.some((r) => r.tipo === 'max_arquivos_por_peticionamento')).toBe(false);
  });

  it('TRTs · PJe-JT: avisa que a ferramenta não verifica PDF/A, exigido na petição inicial', () => {
    expect(perfil('trt-pje-jt').lembretes.join(' ')).toMatch(/PDF\/A/);
  });

  it('TJSP · e-SAJ: 10 MB, o menor valor documentado, com a contradição das fontes registrada', () => {
    const p = perfil('tjsp-esaj');
    expect(tamanho('tjsp-esaj')).toBe(10 * 1_048_576);
    expect(p.observacoes).toMatch(/contradiz|diverg|conflit/i);
    expect(p.observacoes).toMatch(/menor valor/i);
    expect(p.observacoes).toMatch(/Softplan/); // quem escreveu o documento-fonte
  });

  it('TJSP · e-SAJ: registra que o sistema segmenta sozinho arquivos acima de 2 MB', () => {
    expect(perfil('tjsp-esaj').lembretes.join(' ')).toMatch(/2 ?MB/);
  });

  it('TJSP · eproc: 11 MB, e a ressalva de que o manual é do Ministério Público e da Defensoria', () => {
    const p = perfil('tjsp-eproc');
    expect(tamanho('tjsp-eproc')).toBe(11 * 1_048_576);
    expect(limiteEfetivoBytes(p)).toBe(10_957_619);
    expect(p.observacoes).toMatch(/Minist[ée]rio P[úu]blico/);
    expect(p.observacoes).toMatch(/Defensoria/);
    expect(p.observacoes).toMatch(/advogad/i); // diz que não foi confirmado para o painel de advogados
  });

  it('todos os perfis novos têm fonte em URL, data de verificação de hoje e lembrete de conferir a tela', () => {
    for (const id of ['trt-pje-jt', 'tjsp-esaj', 'tjsp-eproc']) {
      const p = perfil(id);
      expect(p.fonte).toMatch(/^https:\/\//);
      expect(p.verificado_em).toBe('2026-11-05');
      expect(p.lembretes.length).toBeGreaterThan(0);
    }
  });

  it('o limite é respeitado no centavo: 9.961.472 bytes cabem no TRT, 9.961.473 não', () => {
    expect(parteCumpre(perfil('trt-pje-jt'), 9_961_472, 30)).toBe(true);
    expect(parteCumpre(perfil('trt-pje-jt'), 9_961_473, 30)).toBe(false);
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
