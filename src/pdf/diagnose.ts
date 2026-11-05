import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  type PDFObject,
  type PDFPage,
} from 'pdf-lib';
import { abrirPdfjs } from './pdfjs';

export interface Diagnostico {
  paginas: number;
  bytesTotal: number;
  /** Estimativa: recursos compartilhados (fontes, imagens) contam inteiros em cada página que os usa. */
  pesoPorPaginaEstimado: number[];
  paginasComTexto: number;
  textoPesquisavel: 'sim' | 'parcial' | 'nao';
  possuiAssinaturaDigital: boolean;
}

export class PdfProtegidoError extends Error {
  constructor(mensagem = 'O PDF está protegido por senha ou criptografia. Remova a proteção e tente de novo.') {
    super(mensagem);
    this.name = 'PdfProtegidoError';
  }
}

/** Não é PDF, está corrompido ou não tem páginas. */
export class PdfInvalidoError extends Error {
  constructor(mensagem = 'O arquivo não é um PDF válido ou está corrompido.', opcoes?: { cause?: unknown }) {
    super(mensagem, opcoes);
    this.name = 'PdfInvalidoError';
  }
}

const TIPO = PDFName.of('Type');
const PAGINA = PDFName.of('Page');
const ARVORE_DE_PAGINAS = PDFName.of('Pages');

function pesoDaPagina(doc: PDFDocument, pagina: PDFPage): number {
  const folha = pagina.node;
  const visitados = new Set<PDFObject>();
  let total = 0;

  const visitar = (obj: PDFObject | undefined): void => {
    const alvo = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
    if (!alvo || visitados.has(alvo)) return;
    visitados.add(alvo);

    if (alvo instanceof PDFStream) {
      total += alvo.getContentsSize();
      visitar(alvo.dict);
    } else if (alvo instanceof PDFDict) {
      // Não sair da página: outras páginas e a árvore de páginas não contam para o peso desta.
      const tipo = alvo.get(TIPO);
      if (alvo !== folha && (tipo === PAGINA || tipo === ARVORE_DE_PAGINAS)) return;
      for (const [, valor] of alvo.entries()) visitar(valor);
    } else if (alvo instanceof PDFArray) {
      for (let i = 0; i < alvo.size(); i++) visitar(alvo.get(i));
    }
  };

  visitar(folha);
  visitar(folha.Resources()); // inclui os recursos herdados do nó Pages
  return total;
}

function campoAssinado(doc: PDFDocument, campo: PDFObject | undefined, visitados: Set<PDFObject>): boolean {
  const alvo = campo instanceof PDFRef ? doc.context.lookup(campo) : campo;
  if (!(alvo instanceof PDFDict) || visitados.has(alvo)) return false;
  visitados.add(alvo);
  if (alvo.lookup(PDFName.of('FT')) === PDFName.of('Sig') && alvo.has(PDFName.of('V'))) return true;
  const filhos = alvo.lookup(PDFName.of('Kids'));
  if (!(filhos instanceof PDFArray)) return false;
  for (let i = 0; i < filhos.size(); i++) if (campoAssinado(doc, filhos.get(i), visitados)) return true;
  return false;
}

/** Há assinatura quando `SigFlags` marca "assinaturas existem" ou algum campo `/Sig` tem valor. */
function temAssinatura(doc: PDFDocument): boolean {
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (!(acroForm instanceof PDFDict)) return false;
  const flags = acroForm.lookup(PDFName.of('SigFlags'));
  if (flags instanceof PDFNumber && (flags.asNumber() & 1) === 1) return true;
  const campos = acroForm.lookup(PDFName.of('Fields'));
  if (!(campos instanceof PDFArray)) return false;
  const visitados = new Set<PDFObject>();
  for (let i = 0; i < campos.size(); i++) if (campoAssinado(doc, campos.get(i), visitados)) return true;
  return false;
}

async function contarPaginasComTexto(bytes: Uint8Array): Promise<number> {
  let pdf;
  try {
    pdf = await abrirPdfjs(bytes);
  } catch (erro) {
    if (erro instanceof Error && erro.name === 'PasswordException') throw new PdfProtegidoError();
    throw new PdfInvalidoError('Não foi possível ler o texto do PDF; o arquivo pode estar corrompido.', { cause: erro });
  }
  try {
    let comTexto = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const conteudo = await pagina.getTextContent();
      if (conteudo.items.some((item) => 'str' in item && item.str.trim() !== '')) comTexto++;
      pagina.cleanup();
    }
    return comTexto;
  } finally {
    await pdf.loadingTask.destroy(); // no pdf.js 6 o destroy() fica na tarefa de carregamento
  }
}

export async function diagnose(bytes: Uint8Array): Promise<Diagnostico> {
  let doc: PDFDocument;
  try {
    // `instanceof EncryptedPDFError` não funciona (o pdf-lib é compilado para ES5): carregar ignorando
    // a criptografia e perguntar a `isEncrypted`.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  } catch (erro) {
    throw new PdfInvalidoError(undefined, { cause: erro });
  }
  if (doc.isEncrypted) throw new PdfProtegidoError();

  // Um PDF com cabeçalho mas estrutura quebrada (download truncado, catálogo sem páginas) carrega,
  // mas falha ao ler a árvore de páginas com erros crus da biblioteca. Todo o acesso estrutural
  // fica aqui dentro para virar uma mensagem clara.
  let paginas: number;
  let pesoPorPaginaEstimado: number[];
  let possuiAssinaturaDigital: boolean;
  try {
    paginas = doc.getPageCount();
    pesoPorPaginaEstimado = doc.getPages().map((p) => pesoDaPagina(doc, p));
    possuiAssinaturaDigital = temAssinatura(doc);
  } catch (erro) {
    throw new PdfInvalidoError(undefined, { cause: erro });
  }
  if (paginas === 0) throw new PdfInvalidoError('O PDF não tem páginas.');

  const paginasComTexto = await contarPaginasComTexto(bytes);
  return {
    paginas,
    bytesTotal: bytes.length,
    pesoPorPaginaEstimado,
    paginasComTexto,
    textoPesquisavel: paginasComTexto === paginas ? 'sim' : paginasComTexto === 0 ? 'nao' : 'parcial',
    possuiAssinaturaDigital,
  };
}
