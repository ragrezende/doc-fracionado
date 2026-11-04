import { PdfInvalidoError, PdfProtegidoError, diagnose } from '../pdf/diagnose';
import { splitPdf } from '../pdf/split';
import type { Perfil } from '../profiles/types';
import { validarTamanho, type Pedido, type Resposta } from './protocol';

function paraErro(erro: unknown): Resposta {
  if (erro instanceof PdfProtegidoError) return { tipo: 'erro', codigo: 'protegido', mensagem: erro.message };
  if (erro instanceof PdfInvalidoError) return { tipo: 'erro', codigo: 'invalido', mensagem: erro.message };
  const detalhe = erro instanceof Error ? erro.message : String(erro);
  return { tipo: 'erro', codigo: 'interno', mensagem: `Erro inesperado ao processar o PDF: ${detalhe}` };
}

/**
 * Trata um pedido do worker: recusa pelo tamanho antes de ler, lê o arquivo (se vier como `File`)
 * e processa. Nunca lança.
 */
export async function processarPedido(pedido: Pedido, emitir: (r: Resposta) => void): Promise<void> {
  const { arquivo } = pedido;
  const tamanho = arquivo instanceof ArrayBuffer ? arquivo.byteLength : arquivo.size;
  const valido = validarTamanho(tamanho);
  if (!valido.ok) {
    emitir({ tipo: 'erro', codigo: 'grande_demais', mensagem: valido.mensagem });
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer());
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    emitir({ tipo: 'erro', codigo: 'interno', mensagem: `Não foi possível ler o arquivo: ${detalhe}` });
    return;
  }
  await processarArquivo(bytes, pedido.perfil, pedido.margem, emitir);
}

/**
 * Diagnostica e divide o PDF, emitindo cada passo por `emitir`. Nunca lança: todo erro vira uma
 * `Resposta` de `erro`. É a função que o worker e os testes usam, sem depender de `Worker`.
 */
export async function processarArquivo(
  bytes: Uint8Array,
  perfil: Perfil,
  margem: number,
  emitir: (r: Resposta) => void,
): Promise<void> {
  const tamanho = validarTamanho(bytes.length);
  if (!tamanho.ok) {
    emitir({ tipo: 'erro', codigo: 'grande_demais', mensagem: tamanho.mensagem });
    return;
  }
  try {
    emitir({ tipo: 'progresso', etapa: 'diagnostico', feito: 0, total: 1 });
    const diagnostico = await diagnose(bytes);
    emitir({ tipo: 'progresso', etapa: 'diagnostico', feito: 1, total: 1 });
    emitir({ tipo: 'diagnostico', diagnostico });

    const resultado = await splitPdf(bytes, perfil, {
      margem,
      onProgresso: (feito, total) => emitir({ tipo: 'progresso', etapa: 'divisao', feito, total }),
    });
    emitir({ tipo: 'resultado', resultado });
  } catch (erro) {
    emitir(paraErro(erro));
  }
}
