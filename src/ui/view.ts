import type { Diagnostico } from '../pdf/diagnose';
import { estaDesatualizado } from '../profiles/parse';
import type { Perfil } from '../profiles/types';
import type { Relatorio } from '../report/report';
import { limiteEfetivoBytes } from '../profiles/rules';
import { T, formatarData, formatarMB, mensagemPaginaPesada, rotuloDaConfianca } from './strings';

export type Estado =
  | { fase: 'inicial' }
  | {
      fase: 'processando';
      nomeArquivo: string;
      etapa: 'diagnostico' | 'divisao';
      feito: number;
      total: number;
    }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'impossivel'; nomeArquivo: string; paginaProblematica: number; bytesDaPagina: number }
  | {
      fase: 'pronto';
      nomeArquivo: string;
      diagnostico: Diagnostico;
      relatorio: Relatorio;
      jaCumpre: boolean;
    };

export interface Acoes {
  aoEscolherArquivo(arquivo: File | null): void;
  aoEscolherPerfil(id: string): void;
  aoBaixarZip(): void;
  aoBaixarOriginal(): void;
}

export interface Tela {
  atualizarPerfil(perfil: Perfil, agora: Date): void;
  atualizarEstado(estado: Estado, perfil: Perfil): void;
}

/** Cria um elemento. Sem atributo `style`: a CSP do site proíbe estilo inline. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string> = {},
  ...filhos: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) elemento.setAttribute(nome, valor);
  elemento.append(...filhos);
  return elemento;
}

function lista(itens: string[]): HTMLUListElement {
  return el('ul', {}, ...itens.map((texto) => el('li', {}, texto)));
}

function linhaDeDados(rotulo: string, valor: string): [HTMLElement, HTMLElement] {
  return [el('dt', {}, rotulo), el('dd', {}, valor)];
}

export function criarTela(raiz: HTMLElement, perfis: Perfil[], acoes: Acoes): Tela {
  const seletor = el('select', { id: 'perfil' });
  for (const p of perfis) seletor.append(el('option', { value: p.id }, `${p.tribunal} · ${p.sistema}`));
  seletor.addEventListener('change', () => acoes.aoEscolherPerfil(seletor.value));

  const entrada = el('input', { id: 'arquivo', type: 'file', accept: 'application/pdf,.pdf' });
  entrada.addEventListener('change', () => acoes.aoEscolherArquivo(entrada.files?.[0] ?? null));

  const cartaoPerfil = el('section', { class: 'cartao', 'aria-labelledby': 'titulo-perfil' });
  const area = el('section', { class: 'area-resultado', 'aria-live': 'polite' });

  raiz.append(
    el(
      'form',
      { class: 'formulario' },
      el('div', { class: 'campo' }, el('label', { for: 'perfil' }, T.rotuloPerfil), seletor),
      el('div', { class: 'campo' }, el('label', { for: 'arquivo' }, T.rotuloArquivo), entrada),
    ),
    cartaoPerfil,
    area,
  );
  raiz.querySelector('form')!.addEventListener('submit', (e) => e.preventDefault());

  function diagnosticoEmLista(d: Diagnostico): HTMLElement {
    const textoPesquisavel =
      d.textoPesquisavel === 'sim' ? T.sim : d.textoPesquisavel === 'nao' ? T.nao : T.parcial(d.paginasComTexto, d.paginas);
    const pesadas = d.pesoPorPaginaEstimado
      .map((peso, i) => ({ pagina: i + 1, peso }))
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 3)
      .map((p) => `p. ${p.pagina} (${formatarMB(p.peso)})`)
      .join(', ');
    return el(
      'dl',
      { class: 'dados' },
      ...linhaDeDados(T.paginas, String(d.paginas)),
      ...linhaDeDados(T.tamanho, formatarMB(d.bytesTotal)),
      ...linhaDeDados(T.textoPesquisavel, textoPesquisavel),
      ...linhaDeDados(T.assinaturaDigital, d.possuiAssinaturaDigital ? T.sim : T.nao),
      ...linhaDeDados(T.maisPesadas, pesadas),
    );
  }

  function tabelaDePartes(r: Relatorio): HTMLElement {
    return el(
      'table',
      {},
      el('caption', {}, T.partes),
      el(
        'thead',
        {},
        el('tr', {}, ...[T.colArquivo, T.colPaginas, T.colTamanho, T.colSituacao].map((c) => el('th', { scope: 'col' }, c))),
      ),
      el(
        'tbody',
        {},
        ...r.partes.map((p) =>
          el(
            'tr',
            {},
            el('td', {}, p.nome),
            el('td', {}, String(p.paginas)),
            el('td', {}, formatarMB(p.bytes)),
            el('td', { class: p.cumpre ? 'ok' : 'falha' }, p.cumpre ? T.cumpre : T.naoCumpre),
          ),
        ),
      ),
    );
  }

  function botao(texto: string, aoClicar: () => void): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'botao' }, texto);
    b.addEventListener('click', aoClicar);
    return b;
  }

  return {
    atualizarPerfil(perfil, agora) {
      seletor.value = perfil.id;
      const fonte = /^https?:\/\//.test(perfil.fonte)
        ? el('a', { href: perfil.fonte, target: '_blank', rel: 'noopener noreferrer' }, perfil.fonte)
        : perfil.fonte;
      cartaoPerfil.replaceChildren(
        el('h2', { id: 'titulo-perfil' }, `${T.tituloPerfil}: ${perfil.tribunal} · ${perfil.sistema}`),
        el('p', { class: 'selo' }, rotuloDaConfianca(perfil.confianca)),
        el('p', {}, `Verificado em ${formatarData(perfil.verificado_em)}`),
        el('p', {}, `${T.fonte}: `, fonte),
        ...(perfil.observacoes ? [el('p', { class: 'discreto' }, perfil.observacoes)] : []),
        ...(estaDesatualizado(perfil, agora) ? [el('p', { class: 'atencao', role: 'note' }, T.desatualizado)] : []),
      );
    },

    atualizarEstado(estado, perfil) {
      switch (estado.fase) {
        case 'inicial':
          area.replaceChildren();
          return;
        case 'processando':
          area.replaceChildren(
            el('p', {}, `${T.arquivo}: `, el('strong', {}, estado.nomeArquivo)),
            el('p', {}, estado.etapa === 'diagnostico' ? T.lendo : T.dividindo(estado.feito, estado.total)),
            el('progress', { max: String(estado.total), value: String(estado.feito) }),
          );
          return;
        case 'erro':
          area.replaceChildren(el('p', { role: 'alert', class: 'erro' }, estado.mensagem));
          return;
        case 'impossivel':
          area.replaceChildren(
            el('h2', {}, T.resultado),
            el('p', {}, `${T.arquivo}: `, el('strong', {}, estado.nomeArquivo)),
            el(
              'p',
              { role: 'alert', class: 'erro' },
              mensagemPaginaPesada(
                estado.paginaProblematica,
                estado.bytesDaPagina,
                limiteEfetivoBytes(perfil),
                `${perfil.tribunal} · ${perfil.sistema}`,
              ),
            ),
          );
          return;
        case 'pronto': {
          const r = estado.relatorio;
          const nomePerfil = `${perfil.tribunal} · ${perfil.sistema}`;
          area.replaceChildren(
            el('h2', {}, T.resultado),
            el('p', {}, `${T.arquivo}: `, el('strong', {}, estado.nomeArquivo)),
            el('h3', {}, T.diagnostico),
            diagnosticoEmLista(estado.diagnostico),
            estado.jaCumpre
              ? el('p', { class: 'destaque' }, T.jaCumpre(nomePerfil))
              : el('p', { class: 'destaque' }, T.dividido(r.partes.length)),
            ...(estado.jaCumpre ? [] : [tabelaDePartes(r)]),
            estado.jaCumpre ? botao(T.baixarOriginal, acoes.aoBaixarOriginal) : botao(T.baixarZip, acoes.aoBaixarZip),
            ...(r.avisos.length ? [el('h3', {}, T.avisos), lista(r.avisos)] : []),
            ...(r.lembretes.length ? [el('h3', {}, T.lembretes), lista(r.lembretes)] : []),
            el('p', { class: 'frase-fixa' }, r.fraseFixa),
          );
        }
      }
    },
  };
}
