import './estilo.css';
import type { Diagnostico } from '../pdf/diagnose';
import { nomeBase } from '../pdf/names';
import type { Parte } from '../pdf/split';
import { montarZip } from '../pdf/zip';
import { carregarPerfis } from '../profiles/load';
import { gerarRelatorio } from '../report/report';
import type { Pedido, Resposta } from '../worker/protocol';
import { T } from './strings';
import { criarTela, type Estado } from './view';

const MARGEM = 0.05;

const perfis = carregarPerfis();
let perfil = perfis[0]!;
let arquivo: File | null = null;
let worker: Worker | null = null;
let execucao = 0; // identifica o processamento em curso; respostas de execuções antigas são ignoradas
let partesGeradas: Parte[] = [];
let relatorioAtual: ReturnType<typeof gerarRelatorio> | null = null;
let nomeDoZip = 'partes.zip';

function baixar(conteudo: Blob, nome: string): void {
  const url = URL.createObjectURL(conteudo);
  const ancora = document.createElement('a');
  ancora.href = url;
  ancora.download = nome;
  ancora.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const tela = criarTela(document.getElementById('app')!, perfis, {
  aoEscolherArquivo(novo) {
    arquivo = novo;
    processar();
  },
  aoEscolherPerfil(id) {
    perfil = perfis.find((p) => p.id === id) ?? perfil;
    tela.atualizarPerfil(perfil, new Date());
    processar();
  },
  aoBaixarZip() {
    const nomes = partesGeradas.map((p, i) => ({ nome: relatorioAtual?.partes[i]?.nome ?? `parte${p.indice}.pdf`, bytes: p.bytes }));
    baixar(new Blob([montarZip(nomes) as BlobPart], { type: 'application/zip' }), nomeDoZip);
  },
  aoBaixarOriginal() {
    if (arquivo) baixar(arquivo, arquivo.name);
  },
});

function definir(estado: Estado): void {
  tela.atualizarEstado(estado, perfil);
}

function processar(): void {
  worker?.terminate(); // encerra o processamento anterior: o resultado dele não deve aparecer
  worker = null;
  partesGeradas = [];
  relatorioAtual = null;
  const minha = ++execucao;

  if (!arquivo) {
    definir({ fase: 'inicial' });
    return;
  }
  const doArquivo = arquivo;
  const doPerfil = perfil;
  definir({ fase: 'processando', nomeArquivo: doArquivo.name, etapa: 'diagnostico', feito: 0, total: 1 });

  const meuWorker = new Worker(new URL('../worker/processar.worker.ts', import.meta.url), { type: 'module' });
  worker = meuWorker;
  let diagnostico: Diagnostico | undefined;

  const encerrar = (): void => {
    meuWorker.terminate();
    if (worker === meuWorker) worker = null;
  };

  meuWorker.onerror = (e) => {
    if (minha !== execucao) return;
    encerrar();
    definir({ fase: 'erro', mensagem: `${T.erroLeitura} ${e.message}` });
  };
  meuWorker.onmessage = (e: MessageEvent<Resposta>) => {
    if (minha !== execucao) return;
    const r = e.data;
    switch (r.tipo) {
      case 'progresso':
        definir({ fase: 'processando', nomeArquivo: doArquivo.name, etapa: r.etapa, feito: r.feito, total: r.total });
        return;
      case 'diagnostico':
        diagnostico = r.diagnostico;
        return;
      case 'erro':
        encerrar();
        definir({ fase: 'erro', mensagem: r.mensagem });
        return;
      case 'resultado': {
        encerrar();
        if (!r.resultado.ok) {
          definir({
            fase: 'impossivel',
            nomeArquivo: doArquivo.name,
            paginaProblematica: r.resultado.paginaProblematica,
            bytesDaPagina: r.resultado.bytesDaPagina,
          });
          return;
        }
        const partes = r.resultado.partes;
        const base = nomeBase(doArquivo.name);
        const relatorio = gerarRelatorio({ perfil: doPerfil, nomeBase: base, partes, diagnostico: diagnostico!, agora: new Date() });
        partesGeradas = partes;
        relatorioAtual = relatorio;
        nomeDoZip = `${base}_partes.zip`;
        definir({
          fase: 'pronto',
          nomeArquivo: doArquivo.name,
          diagnostico: diagnostico!,
          relatorio,
          jaCumpre: partes.length === 1,
        });
      }
    }
  };

  // O File vai para o worker, que o lê: ler centenas de MB aqui congelaria a tela (ver docs/benchmarks).
  const pedido: Pedido = { tipo: 'processar', arquivo: doArquivo, perfil: doPerfil, margem: MARGEM };
  meuWorker.postMessage(pedido);
}

tela.atualizarPerfil(perfil, new Date());
definir({ fase: 'inicial' });
