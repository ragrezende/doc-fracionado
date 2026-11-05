import { randomBytes } from 'node:crypto';
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';

export interface OpcoesPdfSintetico {
  pages: number;
  /** Peso de cada página em bytes (arredondado para cima a múltiplos de 1000). */
  bytesPerPage: number | ((i: number) => number);
  /** Se a página tem texto pesquisável. Padrão: nenhuma página tem. */
  withText?: boolean | ((i: number) => boolean);
}

const LARGURA_IMAGEM = 1000;

/**
 * PDF sintético para testes. A página `i` (base 0) tem largura `200 + i` e altura 300, o que serve
 * de marcador para conferir a ordem. O peso vem de uma imagem DeviceGray sem filtro com bytes
 * aleatórios, que nenhum compressor reduz.
 */
export async function makeSyntheticPdf(o: OpcoesPdfSintetico): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonte = o.withText ? await doc.embedFont(StandardFonts.Helvetica) : undefined;

  for (let i = 0; i < o.pages; i++) {
    const pagina = doc.addPage([200 + i, 300]);
    const peso = typeof o.bytesPerPage === 'function' ? o.bytesPerPage(i) : o.bytesPerPage;
    if (peso > 0) {
      const altura = Math.ceil(peso / LARGURA_IMAGEM);
      const imagem = doc.context.register(
        doc.context.stream(randomBytes(LARGURA_IMAGEM * altura), {
          Type: 'XObject',
          Subtype: 'Image',
          Width: LARGURA_IMAGEM,
          Height: altura,
          ColorSpace: 'DeviceGray',
          BitsPerComponent: 8,
        }),
      );
      pagina.node.setXObject(PDFName.of('Im0'), imagem);
      pagina.pushOperators(pushGraphicsState(), concatTransformationMatrix(10, 0, 0, 10, 0, 0), drawObject('Im0'), popGraphicsState());
    }
    const comTexto = typeof o.withText === 'function' ? o.withText(i) : Boolean(o.withText);
    if (comTexto && fonte) {
      pagina.drawText(`Pagina ${i}`, { x: 20, y: 150, size: 12, font: fonte });
    }
  }
  return doc.save();
}

/** Larguras das páginas, na ordem em que aparecem no documento. */
export async function readPageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPages().map((p) => p.getSize().width);
}
