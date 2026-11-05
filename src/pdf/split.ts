import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject } from 'pdf-lib';
import { limiteEfetivoBytes, parteCumpre } from '../profiles/rules';
import { isolarPaginas } from './isolar';
import type { Perfil } from '../profiles/types';

/** Páginas em base 1, ambas inclusivas. */
export interface Parte {
  indice: number;
  primeiraPagina: number;
  ultimaPagina: number;
  bytes: Uint8Array;
}

export type ResultadoDivisao =
  /**
   * `original: true` só quando o arquivo recebido já cumpre o perfil e a única parte é ele mesmo,
   * byte a byte. Uma única parte regravada (o original excedia o limite por causa de objetos mortos)
   * tem `original: false`: quem a entrega não pode dizer que "o original já cumpre".
   */
  | { ok: true; original: boolean; partes: Parte[] }
  | { ok: false; paginaProblematica: number; bytesDaPagina: number };

export interface OpcoesDivisao {
  /** Fração do limite declarado reservada como folga. Padrão 0.05. */
  margem?: number;
  onProgresso?: (paginasProcessadas: number, total: number) => void;
}

/** Uma medição que caiba e ocupe pelo menos esta fração do limite efetivo encerra a busca da parte. */
const OCUPACAO_ALVO = 0.97;

const ANOTACOES = PDFName.of('Annots');
const SUBTIPO = PDFName.of('Subtype');
const ACAO = PDFName.of('A');

function ehLinkInterno(anotacao: PDFDict): boolean {
  if (anotacao.lookup(SUBTIPO) !== PDFName.of('Link')) return false;
  if (anotacao.has(PDFName.of('Dest'))) return true;
  return anotacao.lookupMaybe(ACAO, PDFDict)?.lookup(PDFName.of('S')) === PDFName.of('GoTo');
}

/**
 * Remove os links com destino interno. Sem isso, `copyPages` copia também a página de destino
 * (como objeto órfão), o que infla a parte e quebra a medição de tamanho. É uma limitação
 * documentada: links e marcadores internos não sobrevivem à divisão.
 */
function removerLinksInternos(doc: PDFDocument): void {
  for (const pagina of doc.getPages()) {
    const anotacoes = pagina.node.lookupMaybe(ANOTACOES, PDFArray);
    if (!anotacoes) continue;
    const mantidas: PDFObject[] = [];
    for (let i = 0; i < anotacoes.size(); i++) {
      const dict = anotacoes.lookupMaybe(i, PDFDict);
      if (!(dict && ehLinkInterno(dict))) mantidas.push(anotacoes.get(i));
    }
    if (mantidas.length !== anotacoes.size()) pagina.node.set(ANOTACOES, doc.context.obj(mantidas));
  }
}

/** Gera de verdade o PDF com as páginas [ini, ini + n) (base 0). É assim que se mede o tamanho. */
async function gerarParte(origem: PDFDocument, ini: number, n: number): Promise<Uint8Array> {
  const parte = await PDFDocument.create();
  const indices = Array.from({ length: n }, (_, k) => ini + k);
  for (const pagina of await parte.copyPages(origem, indices)) parte.addPage(pagina);
  return parte.save();
}

type Achado = { ok: true; n: number; bytes: Uint8Array } | { ok: false; bytesDaPagina: number };

/**
 * Acha o maior número de páginas, a partir de `ini`, cuja parte cumpre o perfil. Primeiro busca,
 * por tamanho (que cresce com o número de páginas), o maior `n` que cabe no limite efetivo.
 * Depois, como a regra de média por página não é monótona, reduz `n` até `parteCumpre` valer.
 */
async function acharMaiorParte(
  origem: PDFDocument,
  ini: number,
  restantes: number,
  perfil: Perfil,
  margem: number,
  bytesPorPagina: number,
): Promise<Achado> {
  const limite = limiteEfetivoBytes(perfil, margem);
  let n = Math.min(restantes, Math.max(1, Math.floor(limite / bytesPorPagina)));
  let melhor: { n: number; bytes: Uint8Array } | undefined; // maior n medido que cabe
  let naoCabe = restantes + 1; // menor n medido que não cabe
  let bytesDeUmaPagina = 0;

  for (;;) {
    const bytes = await gerarParte(origem, ini, n);
    if (bytes.length <= limite) {
      if (!melhor || n > melhor.n) melhor = { n, bytes };
      if (n === restantes || bytes.length >= OCUPACAO_ALVO * limite) break;
    } else {
      naoCabe = Math.min(naoCabe, n);
      if (n === 1) bytesDeUmaPagina = bytes.length;
    }

    const lo = melhor?.n ?? 0;
    if (naoCabe - lo <= 1) break;

    if (!melhor) {
      n = Math.max(1, Math.min(n - 1, Math.floor((n * limite) / bytes.length)));
    } else if (naoCabe > restantes) {
      n = Math.min(restantes, Math.max(melhor.n + 1, Math.ceil((melhor.n * limite) / melhor.bytes.length)));
    } else {
      n = melhor.n + Math.max(1, Math.floor((naoCabe - melhor.n) / 2));
    }
  }

  if (!melhor) return { ok: false, bytesDaPagina: bytesDeUmaPagina };

  let atual = melhor;
  while (!parteCumpre(perfil, atual.bytes.length, atual.n, margem)) {
    if (atual.n === 1) return { ok: false, bytesDaPagina: atual.bytes.length };
    atual = { n: atual.n - 1, bytes: await gerarParte(origem, ini, atual.n - 1) };
  }
  return { ok: true, n: atual.n, bytes: atual.bytes };
}

/**
 * A página `ini` não cumpre o perfil nem sozinha (típico da regra de média por página: uma foto
 * pesada no fim do volume). A parte anterior pode ceder as `k` últimas páginas, leves, para que
 * a pesada entre numa parte onde a média fecha. Tenta k = 1, 2, … e fica com o primeiro que serve.
 * Devolve a nova posição de `ini` (já com as duas partes trocadas em `partes`), ou `undefined`.
 * É um recuo de um nível só: não procura a divisão ótima, só evita o falso "precisa de compressão".
 */
async function recuarParteAnterior(
  doc: PDFDocument,
  partes: Parte[],
  ini: number,
  total: number,
  perfil: Perfil,
  margem: number,
  bytesPorPagina: number,
): Promise<number | undefined> {
  const anterior = partes.at(-1);
  if (!anterior) return undefined;
  const inicioAnterior = anterior.primeiraPagina - 1;

  for (let k = 1; k < anterior.ultimaPagina - anterior.primeiraPagina + 1; k++) {
    const novoIni = ini - k;
    const paginasAparadas = novoIni - inicioAnterior;
    const aparada = await gerarParte(doc, inicioAnterior, paginasAparadas);
    if (!parteCumpre(perfil, aparada.length, paginasAparadas, margem)) continue;

    const nova = await acharMaiorParte(doc, novoIni, total - novoIni, perfil, margem, bytesPorPagina);
    if (!nova.ok || nova.n <= k) continue; // a nova parte precisa chegar até a página pesada

    partes.pop();
    partes.push({ indice: partes.length + 1, primeiraPagina: inicioAnterior + 1, ultimaPagina: novoIni, bytes: aparada });
    partes.push({ indice: partes.length + 1, primeiraPagina: novoIni + 1, ultimaPagina: novoIni + nova.n, bytes: nova.bytes });
    return novoIni + nova.n;
  }
  return undefined;
}

/**
 * Divide o PDF em partes que cumprem o perfil. Corta só em limite de página e preserva a ordem.
 * O tamanho de cada parte é medido gerando-a de verdade, nunca estimado: fontes e imagens
 * compartilhadas se repetem em cada parte, então somar o peso das páginas não prevê o resultado.
 */
export async function splitPdf(
  origem: Uint8Array,
  perfil: Perfil,
  opts: OpcoesDivisao = {},
): Promise<ResultadoDivisao> {
  const margem = opts.margem ?? 0.05;
  const doc = await PDFDocument.load(origem, { updateMetadata: false });
  const total = doc.getPageCount();
  if (total === 0) throw new Error('O PDF não tem páginas.');

  // Já cumpre o perfil: devolve o arquivo original, byte a byte, sem reserializar.
  if (parteCumpre(perfil, origem.length, total, margem)) {
    opts.onProgresso?.(total, total);
    return { ok: true, original: true, partes: [{ indice: 1, primeiraPagina: 1, ultimaPagina: total, bytes: origem }] };
  }

  removerLinksInternos(doc);
  isolarPaginas(doc);

  const partes: Parte[] = [];
  let ini = 0;
  let bytesPorPagina = origem.length / total;
  while (ini < total) {
    const achado = await acharMaiorParte(doc, ini, total - ini, perfil, margem, bytesPorPagina);
    if (!achado.ok) {
      const novoIni = await recuarParteAnterior(doc, partes, ini, total, perfil, margem, bytesPorPagina);
      if (novoIni === undefined) {
        return { ok: false, paginaProblematica: ini + 1, bytesDaPagina: achado.bytesDaPagina };
      }
      ini = novoIni;
      opts.onProgresso?.(ini, total);
      continue;
    }
    partes.push({ indice: partes.length + 1, primeiraPagina: ini + 1, ultimaPagina: ini + achado.n, bytes: achado.bytes });
    bytesPorPagina = achado.bytes.length / achado.n;
    ini += achado.n;
    opts.onProgresso?.(ini, total);
  }
  return { ok: true, original: false, partes };
}
