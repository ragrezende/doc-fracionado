import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { montarZip } from '../../src/pdf/zip';

const bytes = (...n: number[]) => new Uint8Array(n);

describe('montarZip', () => {
  it('devolve os mesmos nomes e bytes ao descompactar', () => {
    const zip = montarZip([
      { nome: 'a_parte01de02.pdf', bytes: bytes(1, 2, 3) },
      { nome: 'a_parte02de02.pdf', bytes: bytes(4, 5) },
    ]);
    const lido = unzipSync(zip);
    expect(Object.keys(lido)).toEqual(['a_parte01de02.pdf', 'a_parte02de02.pdf']);
    expect(lido['a_parte01de02.pdf']).toEqual(bytes(1, 2, 3));
    expect(lido['a_parte02de02.pdf']).toEqual(bytes(4, 5));
  });

  it('guarda sem compressão: o PDF já é comprimido e o ZIP só empacota', () => {
    const conteudo = new Uint8Array(10_000).fill(7); // compressível de propósito
    const zip = montarZip([{ nome: 'x.pdf', bytes: conteudo }]);
    expect(zip.length).toBeGreaterThan(conteudo.length);
  });

  it('marca nomes com acento como UTF-8 (bit 11 das flags do cabeçalho local)', () => {
    const zip = montarZip([{ nome: 'Petição inicial_parte01de02.pdf', bytes: bytes(1) }]);
    const visao = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(visao.getUint32(0, true)).toBe(0x04034b50); // assinatura do cabeçalho local
    expect(visao.getUint16(6, true) & 0x0800).toBe(0x0800);
  });
});
