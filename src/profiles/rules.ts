import type { Perfil } from './types';

/** Limite de tamanho por arquivo já descontada a margem de segurança (padrão 5%). */
export function limiteEfetivoBytes(p: Perfil, margem = 0.05): number {
  const restricao = p.restricoes.find((r) => r.tipo === 'tamanho_maximo_arquivo');
  if (!restricao || restricao.tipo !== 'tamanho_maximo_arquivo') {
    throw new Error(`Perfil ${p.id} sem tamanho_maximo_arquivo`);
  }
  return Math.floor(restricao.bytes - restricao.bytes * margem);
}

/**
 * Diz se uma parte, com o tamanho e a contagem de páginas dados, cumpre o perfil.
 * A faixa de `quando_arquivo_entre_bytes` usa os limites declarados: vale para `bytes > min && bytes <= max`.
 */
export function parteCumpre(p: Perfil, bytes: number, paginas: number, margem = 0.05): boolean {
  if (bytes > limiteEfetivoBytes(p, margem)) return false;
  for (const r of p.restricoes) {
    if (r.tipo !== 'media_maxima_por_pagina') continue;
    const [min, max] = r.quando_arquivo_entre_bytes ?? [0, Number.POSITIVE_INFINITY];
    if (bytes > min && bytes <= max) {
      if (paginas <= 0) return false;
      if (bytes / paginas > r.bytes_por_pagina * (1 - margem)) return false;
    }
  }
  return true;
}
