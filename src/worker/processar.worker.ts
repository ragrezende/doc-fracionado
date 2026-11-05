// Ponto de entrada do Web Worker: liga `postMessage` a `processarArquivo`. Só roda no navegador.
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'; // o mesmo módulo que src/pdf/pdfjs.ts usa
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { criarWorkerSeguro } from './criarWorker';
import { processarPedido } from './processar';
import type { Pedido, Resposta } from './protocol';

// O pdf.js tem o seu próprio worker, que também recebe os bytes do PDF. Criá-lo como worker `blob:`
// o faz herdar a CSP do documento (ver criarWorkerSeguro). `import.meta.url` aqui é a URL http real
// deste módulo, base correta para resolver a URL do worker do pdf.js.
GlobalWorkerOptions.workerPort = criarWorkerSeguro(new URL(pdfjsWorkerUrl, import.meta.url).href);

interface EscopoDoWorker {
  onmessage: ((evento: MessageEvent<Pedido>) => void) | null;
  postMessage(mensagem: Resposta, transferir: Transferable[]): void;
}
const escopo = self as unknown as EscopoDoWorker;

/** Transfere (sem copiar) só os buffers que são do tamanho exato do arquivo; os demais seriam recortes. */
function buffersTransferiveis(r: Resposta): Transferable[] {
  if (r.tipo !== 'resultado' || !r.resultado.ok) return [];
  const unicos = new Set<ArrayBuffer>();
  for (const parte of r.resultado.partes) {
    const { buffer, byteOffset, byteLength } = parte.bytes;
    if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) unicos.add(buffer);
  }
  return [...unicos];
}

escopo.onmessage = (evento) => {
  const pedido = evento.data;
  if (pedido.tipo !== 'processar') return;
  void processarPedido(pedido, (r) => escopo.postMessage(r, buffersTransferiveis(r)));
};
