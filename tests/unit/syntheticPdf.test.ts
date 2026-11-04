import { describe, expect, it } from 'vitest';
import { makeSyntheticPdf, readPageWidths } from '../helpers/syntheticPdf';

describe('makeSyntheticPdf', () => {
  it('gera o número de páginas pedido, com largura 200 + índice', async () => {
    const pdf = await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000 });
    expect(await readPageWidths(pdf)).toEqual([200, 201, 202]);
  });

  it('dá a cada página aproximadamente o peso pedido (incompressível)', async () => {
    const pdf = await makeSyntheticPdf({ pages: 4, bytesPerPage: 100_000 });
    expect(pdf.length).toBeGreaterThanOrEqual(400_000);
    expect(pdf.length).toBeLessThan(440_000);
  });

  it('aceita uma função de peso por página', async () => {
    const pdf = await makeSyntheticPdf({ pages: 2, bytesPerPage: (i) => (i === 0 ? 10_000 : 300_000) });
    expect(pdf.length).toBeGreaterThanOrEqual(310_000);
    expect(pdf.length).toBeLessThan(340_000);
  });
});
