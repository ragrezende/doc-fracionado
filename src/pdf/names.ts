/**
 * Nome do arquivo sem a extensão `.pdf` (em qualquer caixa), em Unicode composto. O macOS entrega
 * acentos decompostos, que em ZIPs abertos no Windows aparecem como letra + acento soltos.
 */
export function nomeBase(nomeArquivo: string): string {
  const base = nomeArquivo.replace(/\.pdf$/i, '').normalize('NFC').trim();
  return base === '' ? 'documento' : base;
}

/** `NomeOriginal_parte01de09.pdf`; o preenchimento tem dois dígitos no mínimo e cresce com o total. */
export function nomeDaParte(base: string, indice: number, total: number): string {
  const largura = Math.max(2, String(total).length);
  const preencher = (n: number) => String(n).padStart(largura, '0');
  return `${base}_parte${preencher(indice)}de${preencher(total)}.pdf`;
}
