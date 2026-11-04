import type { Diagnostico } from '../pdf/diagnose';
import { nomeDaParte } from '../pdf/names';
import type { Parte } from '../pdf/split';
import { estaDesatualizado } from '../profiles/parse';
import { parteCumpre } from '../profiles/rules';
import type { Confianca, Perfil } from '../profiles/types';

export const FRASE_FIXA = 'Confira o limite na tela de envio do tribunal.';

export interface RelatorioParte {
  nome: string;
  bytes: number;
  paginas: number;
  /** Conferido contra o limite declarado do perfil, sem a margem de segurança. */
  cumpre: boolean;
}

export interface Relatorio {
  perfilId: string;
  confianca: Confianca;
  fonte: string;
  verificadoEm: string;
  desatualizado: boolean;
  partes: RelatorioParte[];
  avisos: string[];
  lembretes: string[];
  fraseFixa: string;
}

export function gerarRelatorio(a: {
  perfil: Perfil;
  nomeBase: string;
  partes: Parte[];
  diagnostico: Diagnostico;
  agora: Date;
}): Relatorio {
  const { perfil, diagnostico } = a;
  const total = a.partes.length;

  const partes: RelatorioParte[] = a.partes.map((p) => {
    const paginas = p.ultimaPagina - p.primeiraPagina + 1;
    return {
      nome: nomeDaParte(a.nomeBase, p.indice, total),
      bytes: p.bytes.length,
      paginas,
      cumpre: parteCumpre(perfil, p.bytes.length, paginas, 0),
    };
  });

  const avisos: string[] = [];

  for (const p of partes) {
    if (!p.cumpre) avisos.push(`A parte ${p.nome} não cumpre o perfil ${perfil.id}.`);
  }

  for (const r of perfil.restricoes) {
    if (r.tipo === 'max_arquivos_por_peticionamento' && total > r.quantidade) {
      avisos.push(
        `O envio terá ${total} arquivos, e o ${perfil.sistema} do ${perfil.tribunal} aceita até ${r.quantidade} por peticionamento.`,
      );
    }
    if (r.tipo === 'texto_pesquisavel' && diagnostico.textoPesquisavel !== 'sim') {
      avisos.push(
        diagnostico.textoPesquisavel === 'nao'
          ? `O PDF não tem texto pesquisável. O ${perfil.sistema} do ${perfil.tribunal} orienta que a digitalização use OCR.`
          : `Só ${diagnostico.paginasComTexto} de ${diagnostico.paginas} páginas têm texto pesquisável. O ${perfil.sistema} do ${perfil.tribunal} orienta que a digitalização use OCR.`,
      );
    }
  }

  if (diagnostico.possuiAssinaturaDigital) {
    avisos.push('Este PDF tem assinatura digital. Dividir o arquivo invalida a assinatura nas partes geradas.');
  }

  return {
    perfilId: perfil.id,
    confianca: perfil.confianca,
    fonte: perfil.fonte,
    verificadoEm: perfil.verificado_em,
    desatualizado: estaDesatualizado(perfil, a.agora),
    partes,
    avisos,
    lembretes: perfil.lembretes,
    fraseFixa: FRASE_FIXA,
  };
}
