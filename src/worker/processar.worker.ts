// Ponto de entrada do Web Worker: liga `postMessage` a `processarArquivo`. Só roda no navegador.
import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { processarArquivo } from './processar';
import type { Pedido, Resposta } from './protocol';

// No navegador o pdf.js precisa saber onde está o seu worker (mesma origem, permitido pela CSP).
GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

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
  void processarArquivo(new Uint8Array(pedido.arquivo), pedido.perfil, pedido.margem, (r) =>
    escopo.postMessage(r, buffersTransferiveis(r)),
  );
};
