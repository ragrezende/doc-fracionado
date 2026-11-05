import { describe, expect, it } from 'vitest';
import { nomeBase, nomeDaParte } from '../../src/pdf/names';

describe('nomeDaParte', () => {
  it('usa dois dígitos no mínimo: Volume1_parte01de09.pdf', () => {
    expect(nomeDaParte('Volume1', 1, 9)).toBe('Volume1_parte01de09.pdf');
  });

  it('alarga o preenchimento para caber o total: V_parte007de120.pdf', () => {
    expect(nomeDaParte('V', 7, 120)).toBe('V_parte007de120.pdf');
  });

  it('preserva acentos e espaços do nome original', () => {
    expect(nomeDaParte('Petição inicial', 2, 3)).toBe('Petição inicial_parte02de03.pdf');
  });
});

describe('nomeBase', () => {
  it('remove .pdf em qualquer caixa', () => {
    expect(nomeBase('Petição inicial.PDF')).toBe('Petição inicial');
    expect(nomeBase('volume.pdf')).toBe('volume');
    expect(nomeBase('volume.Pdf')).toBe('volume');
  });

  it('mantém nomes sem extensão e remove só a última extensão .pdf', () => {
    expect(nomeBase('sem-extensao')).toBe('sem-extensao');
    expect(nomeBase('copia.pdf.pdf')).toBe('copia.pdf');
  });

  it("usa 'documento' quando o nome some ao tirar a extensão", () => {
    expect(nomeBase('.pdf')).toBe('documento');
  });

  it('normaliza acentos decompostos (macOS) para a forma composta', () => {
    const decomposto = 'Petição.pdf';
    expect(nomeBase(decomposto)).toBe('Petição');
    expect(nomeBase(decomposto)).toBe('Petição'.normalize('NFC'));
  });
});
