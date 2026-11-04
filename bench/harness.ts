// Página de teste do portão técnico: roda o mesmo worker do site e publica o resultado em
// `window.__bench`, que o `bench/run.ts` (Playwright) lê.
import { carregarPerfis } from '../src/profiles/load';
import { limiteEfetivoBytes } from '../src/profiles/rules';
import type { Diagnostico } from '../src/pdf/diagnose';
import type { Pedido, Resposta } from '../src/worker/protocol';

export interface ResultadoBench {
  ok: boolean;
  motivo?: string;
  tempoMs: number;
  maxCongelamentoMs: number;
  paginas?: number;
  partes?: number;
  maiorParteBytes?: number;
  heapPrincipalMB?: number;
}

declare global {
  interface Window {
    __bench?: ResultadoBench;
  }
}

const saida = document.getElementById('saida')!;
const perfilId = new URLSearchParams(location.search).get('perfil') ?? 'tjgo-projudi';

document.getElementById('arquivo')!.addEventListener('change', async (evento) => {
  const arquivo = (evento.target as HTMLInputElement).files![0]!;
  const perfil = carregarPerfis().find((p) => p.id === perfilId)!;
  const margem = 0.05;

  // Batimento de 100 ms na thread principal: o maior atraso medido é o "congelamento" da tela.
  let ultimo = performance.now();
  let maxCongelamentoMs = 0;
  const batimento = setInterval(() => {
    const agora = performance.now();
    maxCongelamentoMs = Math.max(maxCongelamentoMs, agora - ultimo - 100);
    ultimo = agora;
  }, 100);

  const inicio = performance.now();
  const worker = new Worker(new URL('../src/worker/processar.worker.ts', import.meta.url), { type: 'module' });
  let diagnostico: Diagnostico | undefined;

  const concluir = (parcial: Omit<ResultadoBench, 'tempoMs' | 'maxCongelamentoMs'>): void => {
    clearInterval(batimento);
    worker.terminate();
    const memoria = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    window.__bench = {
      ...parcial,
      tempoMs: Math.round(performance.now() - inicio),
      maxCongelamentoMs: Math.round(maxCongelamentoMs),
      heapPrincipalMB: memoria ? Math.round(memoria.usedJSHeapSize / 1048576) : undefined,
    };
    saida.textContent = JSON.stringify(window.__bench, null, 2);
  };

  worker.onerror = (e) => concluir({ ok: false, motivo: `erro do worker: ${e.message}` });
  worker.onmessage = (e: MessageEvent<Resposta>) => {
    const r = e.data;
    if (r.tipo === 'progresso') {
      saida.textContent = `${r.etapa}: ${r.feito}/${r.total}`;
    } else if (r.tipo === 'diagnostico') {
      diagnostico = r.diagnostico;
    } else if (r.tipo === 'erro') {
      concluir({ ok: false, motivo: `${r.codigo}: ${r.mensagem}` });
    } else if (r.tipo === 'resultado') {
      if (!r.resultado.ok) {
        concluir({ ok: false, motivo: `página ${r.resultado.paginaProblematica} não cabe no perfil` });
        return;
      }
      const partes = r.resultado.partes;
      const limite = limiteEfetivoBytes(perfil, margem);
      const somaPaginas = partes.reduce((s, p) => s + (p.ultimaPagina - p.primeiraPagina + 1), 0);
      const contiguas = partes.every((p, i) => p.primeiraPagina === (i === 0 ? 1 : partes[i - 1]!.ultimaPagina + 1));
      const maiorParteBytes = Math.max(...partes.map((p) => p.bytes.length));
      const consistente = somaPaginas === diagnostico?.paginas && contiguas && maiorParteBytes <= limite;
      concluir({
        ok: consistente,
        motivo: consistente ? undefined : 'divisão inconsistente (páginas, ordem ou tamanho)',
        paginas: diagnostico?.paginas,
        partes: partes.length,
        maiorParteBytes,
      });
    }
  };

  // O File vai para o worker, que o lê (a leitura conta no tempo, como no uso real).
  const pedido: Pedido = { tipo: 'processar', arquivo, perfil, margem };
  worker.postMessage(pedido);
});
