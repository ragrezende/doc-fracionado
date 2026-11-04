import type { Diagnostico } from '../pdf/diagnose';
import type { ResultadoDivisao } from '../pdf/split';
import type { Perfil } from '../profiles/types';

/** Acima disso a ferramenta se recusa a processar (faixa definida pelo portão técnico). */
export const LIMITE_SEGURO_BYTES = 300 * 1024 * 1024;

export const MENSAGEM_GRANDE_DEMAIS = 'Arquivo grande demais para processar com segurança neste navegador.';

export function validarTamanho(bytes: number): { ok: true } | { ok: false; mensagem: string } {
  return bytes <= LIMITE_SEGURO_BYTES ? { ok: true } : { ok: false, mensagem: MENSAGEM_GRANDE_DEMAIS };
}

export type Pedido = { tipo: 'processar'; arquivo: ArrayBuffer; perfil: Perfil; margem: number };

export type Resposta =
  | { tipo: 'progresso'; etapa: 'diagnostico' | 'divisao'; feito: number; total: number }
  | { tipo: 'diagnostico'; diagnostico: Diagnostico }
  | { tipo: 'resultado'; resultado: ResultadoDivisao }
  | { tipo: 'erro'; codigo: 'protegido' | 'invalido' | 'grande_demais' | 'interno'; mensagem: string };
