// Build "legacy": traz polyfills (por exemplo, de `Promise.try`, que o build moderno exige e só existe
// a partir do Chrome/Edge 128) e é o mesmo que o Node usa nos testes. Custa ~4% a mais de tamanho.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type DocumentoPdfjs = Awaited<ReturnType<typeof getDocument>['promise']>;

/**
 * Abre um PDF com o pdf.js. Os bytes são copiados: o pdf.js pode transferir o buffer a um worker e
 * deixá-lo inutilizável, e o chamador ainda precisa deles para dividir o arquivo.
 *
 * A CSP do site proíbe `eval`. O pdf.js 6 já não tem a opção `isEvalSupported` (verificado: nem
 * `build/pdf.mjs` nem `build/pdf.worker.mjs` usam `eval(` ou o construtor `Function`), então não há
 * o que configurar aqui. O teste de CSP da Task 6 é a garantia de que isso continua verdade.
 */
export function abrirPdfjs(bytes: Uint8Array): Promise<DocumentoPdfjs> {
  return getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
}
