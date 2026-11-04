import type { Diagnostico } from '../pdf/diagnose';
import type { ResultadoDivisao } from '../pdf/split';
import type { Perfil } from '../profiles/types';

/** Acima disso a ferramenta se recusa a processar (faixa definida pelo portão técnico). */
export const LIMITE_SEGURO_BYTES = 300 * 1024 * 1024;

export const MENSAGEM_GRANDE_DEMAIS = 'Arquivo grande demais para processar com segurança neste navegador.';

export function validarTamanho(bytes: number): { ok: true } | { ok: false; mensagem: string } {
  return bytes <= LIMITE_SEGURO_BYTES ? { ok: true } : { ok: false, mensagem: MENSAGEM_GRANDE_DEMAIS };
}

/**
 * O que o worker precisa de um arquivo: o tamanho (para recusar sem ler) e a leitura. Um `File`
 * satisfaz isto. Passar o `File` em vez do conteúdo tira a leitura de centenas de MB da thread
 * principal, onde ela congelava a tela (medido no portão técnico).
 */
export interface ArquivoLegivel {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type Pedido = {
  tipo: 'processar';
  arquivo: ArrayBuffer | ArquivoLegivel;
  perfil: Perfil;
  margem: number;
};

export type Resposta =
  | { tipo: 'progresso'; etapa: 'diagnostico' | 'divisao'; feito: number; total: number }
  | { tipo: 'diagnostico'; diagnostico: Diagnostico }
  | { tipo: 'resultado'; resultado: ResultadoDivisao }
  | { tipo: 'erro'; codigo: 'protegido' | 'invalido' | 'grande_demais' | 'interno'; mensagem: string };
