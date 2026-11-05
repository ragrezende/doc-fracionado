import type { Confianca, Perfil, Restricao } from './types';

export class PerfilInvalidoError extends Error {
  constructor(
    public readonly caminho: string,
    mensagem: string,
  ) {
    super(`Perfil inválido em "${caminho}": ${mensagem}`);
    this.name = 'PerfilInvalidoError';
  }
}

const CONFIANCAS: Confianca[] = ['oficial', 'noticia_nao_oficial', 'reportado_por_usuario'];
const CHAVES_PERFIL = ['id', 'tribunal', 'sistema', 'restricoes', 'confianca', 'fonte', 'verificado_em', 'observacoes', 'lembretes'];
const MS_POR_DIA = 86_400_000;

type Objeto = Record<string, unknown>;

function exigeObjeto(valor: unknown, caminho: string): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new PerfilInvalidoError(caminho, 'esperava um objeto');
  }
  return valor as Objeto;
}

function exigeTexto(o: Objeto, chave: string, caminho: string, podeVazio = false): string {
  const v = o[chave];
  if (typeof v !== 'string' || (!podeVazio && v.trim() === '')) {
    throw new PerfilInvalidoError(`${caminho}${chave}`, 'esperava texto não vazio');
  }
  return v;
}

function exigeInteiroPositivo(o: Objeto, chave: string, caminho: string): number {
  const v = o[chave];
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new PerfilInvalidoError(`${caminho}${chave}`, 'esperava um inteiro maior que zero');
  }
  return v;
}

function semChavesExtras(o: Objeto, permitidas: string[], caminho: string): void {
  for (const chave of Object.keys(o)) {
    if (!permitidas.includes(chave)) {
      throw new PerfilInvalidoError(`${caminho}${chave}`, 'campo desconhecido');
    }
  }
}

function dataValida(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function parseRestricao(valor: unknown, indice: number): Restricao {
  const caminho = `restricoes[${indice}].`;
  const o = exigeObjeto(valor, `restricoes[${indice}]`);
  switch (o.tipo) {
    case 'tamanho_maximo_arquivo':
      semChavesExtras(o, ['tipo', 'bytes'], caminho);
      return { tipo: o.tipo, bytes: exigeInteiroPositivo(o, 'bytes', caminho) };
    case 'media_maxima_por_pagina': {
      semChavesExtras(o, ['tipo', 'bytes_por_pagina', 'quando_arquivo_entre_bytes'], caminho);
      const resultado: Restricao = {
        tipo: o.tipo,
        bytes_por_pagina: exigeInteiroPositivo(o, 'bytes_por_pagina', caminho),
      };
      if (o.quando_arquivo_entre_bytes !== undefined) {
        const faixa = o.quando_arquivo_entre_bytes;
        const ok =
          Array.isArray(faixa) &&
          faixa.length === 2 &&
          faixa.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
        if (!ok) {
          throw new PerfilInvalidoError(`${caminho}quando_arquivo_entre_bytes`, 'esperava [mínimo, máximo] inteiros');
        }
        resultado.quando_arquivo_entre_bytes = [faixa[0] as number, faixa[1] as number];
      }
      return resultado;
    }
    case 'max_arquivos_por_peticionamento':
      semChavesExtras(o, ['tipo', 'quantidade'], caminho);
      return { tipo: o.tipo, quantidade: exigeInteiroPositivo(o, 'quantidade', caminho) };
    case 'texto_pesquisavel':
      semChavesExtras(o, ['tipo', 'nivel'], caminho);
      if (o.nivel !== 'aviso') throw new PerfilInvalidoError(`${caminho}nivel`, 'valor aceito: "aviso"');
      return { tipo: o.tipo, nivel: 'aviso' };
    default:
      throw new PerfilInvalidoError(`${caminho}tipo`, 'tipo de restrição desconhecido');
  }
}

export function parsePerfil(json: unknown): Perfil {
  const o = exigeObjeto(json, 'perfil');
  semChavesExtras(o, CHAVES_PERFIL, '');

  if (!Array.isArray(o.restricoes)) {
    throw new PerfilInvalidoError('restricoes', 'esperava uma lista');
  }
  const restricoes = o.restricoes.map(parseRestricao);
  const quantosTamanhos = restricoes.filter((r) => r.tipo === 'tamanho_maximo_arquivo').length;
  if (quantosTamanhos !== 1) {
    throw new PerfilInvalidoError('restricoes', 'exige exatamente um tamanho_maximo_arquivo');
  }

  const confianca = o.confianca;
  if (!CONFIANCAS.includes(confianca as Confianca)) {
    throw new PerfilInvalidoError('confianca', `valores aceitos: ${CONFIANCAS.join(', ')}`);
  }

  const verificadoEm = exigeTexto(o, 'verificado_em', '');
  if (!dataValida(verificadoEm)) {
    throw new PerfilInvalidoError('verificado_em', 'esperava uma data válida no formato AAAA-MM-DD');
  }

  if (!Array.isArray(o.lembretes) || !o.lembretes.every((l) => typeof l === 'string' && l.trim() !== '')) {
    throw new PerfilInvalidoError('lembretes', 'esperava uma lista de textos não vazios');
  }

  return {
    id: exigeTexto(o, 'id', ''),
    tribunal: exigeTexto(o, 'tribunal', ''),
    sistema: exigeTexto(o, 'sistema', ''),
    restricoes,
    confianca: confianca as Confianca,
    fonte: exigeTexto(o, 'fonte', ''),
    verificado_em: verificadoEm,
    observacoes: exigeTexto(o, 'observacoes', '', true),
    lembretes: o.lembretes as string[],
  };
}

/** Desatualizado quando a verificação tem mais de `dias` dias (datas comparadas em UTC). */
export function estaDesatualizado(p: Perfil, agora: Date, dias = 180): boolean {
  const [a, m, d] = p.verificado_em.split('-').map(Number) as [number, number, number];
  const verificado = Date.UTC(a, m - 1, d);
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  return Math.floor((hoje - verificado) / MS_POR_DIA) > dias;
}
