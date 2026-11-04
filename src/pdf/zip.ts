import { zipSync, type Zippable } from 'fflate';

/** ZIP sem compressão (nível 0): o PDF já é comprimido, o ZIP só empacota. Nomes não ASCII saem em UTF-8. */
export function montarZip(arquivos: { nome: string; bytes: Uint8Array }[]): Uint8Array {
  const conteudo: Zippable = {};
  for (const { nome, bytes } of arquivos) conteudo[nome] = [bytes, { level: 0 }];
  return zipSync(conteudo);
}
