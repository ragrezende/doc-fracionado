import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';

const TIPO = PDFName.of('Type');
const PARENT = PDFName.of('Parent');
const TIPOS_QUE_ARRASTAM_O_DOCUMENTO = new Set<PDFObject>([
  PDFName.of('Page'),
  PDFName.of('Pages'),
  PDFName.of('Catalog'),
]);

/** Uma página, um nó da árvore de páginas ou o catálogo: copiar qualquer um deles puxa o documento. */
function arrastaODocumento(obj: PDFObject | undefined): boolean {
  if (!(obj instanceof PDFDict)) return false;
  const tipo = obj.get(TIPO);
  return tipo !== undefined && TIPOS_QUE_ARRASTAM_O_DOCUMENTO.has(tipo);
}

/**
 * Corta, no documento em memória, toda referência que leva de um objeto a outra página, a um nó
 * `Pages` ou ao catálogo. O `copyPages` do pdf-lib segue qualquer referência e copia o alvo como
 * objeto órfão; sem isto, um widget de formulário (`/P`, `/Parent` → `/Kids`), um destino de link
 * ou o `/Data` de uma assinatura DocMDP arrastam páginas inteiras, ou o catálogo, para dentro de
 * cada parte. O efeito era inflar a parte e dar um falso "esta página precisa de compressão".
 *
 * Percorre cada objeto uma única vez. A única referência que sai de uma página e é preservada é o
 * `/Parent` dela, que o pdf-lib trata à parte ao copiar. Referências cortadas não voltam: a
 * mudança vale para todas as partes geradas a partir deste documento.
 */
export function isolarPaginas(doc: PDFDocument): void {
  const visitados = new Set<PDFObject>();
  const resolver = (o: PDFObject | undefined): PDFObject | undefined =>
    o instanceof PDFRef ? doc.context.lookup(o) : o;

  const percorrer = (objeto: PDFObject, ehFolhaDePagina: boolean): void => {
    if (visitados.has(objeto)) return;
    visitados.add(objeto);

    const dict = objeto instanceof PDFStream ? objeto.dict : objeto;
    if (dict instanceof PDFDict) {
      for (const [chave, valor] of [...dict.entries()]) {
        if (ehFolhaDePagina && chave === PARENT) continue;
        const alvo = resolver(valor);
        if (arrastaODocumento(alvo)) dict.delete(chave);
        else if (alvo) percorrer(alvo, false);
      }
    } else if (dict instanceof PDFArray) {
      for (let i = dict.size() - 1; i >= 0; i--) {
        const alvo = resolver(dict.get(i));
        if (arrastaODocumento(alvo)) dict.remove(i);
        else if (alvo) percorrer(alvo, false);
      }
    }
  };

  for (const pagina of doc.getPages()) percorrer(pagina.node, true);
}
