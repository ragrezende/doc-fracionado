// Portão técnico (spec, seção 8): roda o processamento de PDFs grandes num Chromium real e mede
// tempo, congelamento da tela, crash e (quando o sistema deixa) o pico de memória do navegador.
//
// Uso:    npm run bench -- [--channel msedge|chrome] [--only 100|300] [--perfil tjgo-projudi|trf1-pje]
// Requer: um Chromium instalado para o Playwright (`npx playwright install chromium`) ou o Edge/Chrome
//         do sistema com --channel. Em ambientes com navegador pré-instalado, defina
//         PLAYWRIGHT_CHROMIUM_EXECUTABLE com o caminho do executável.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { makeSyntheticPdf } from '../tests/helpers/syntheticPdf';
import type { ResultadoBench } from './harness';

const MiB = 1024 * 1024;
const BYTES_POR_PAGINA = 500_000; // ordem de grandeza de uma página digitalizada
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(raiz, 'bench/.cache');

interface Caso {
  tamanhoMiB: 100 | 300;
  variante: 'imagem' | 'imagem+texto';
}

/** Critérios do portão (plano, Task 4, Step 6). */
const CRITERIOS = {
  100: { tempoMaxMs: 180_000, congelamentoMaxMs: 500 as number | undefined },
  300: { tempoMaxMs: 900_000, congelamentoMaxMs: undefined as number | undefined },
};

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function gerarPdf(caso: Caso): Promise<{ caminho: string; bytes: number }> {
  mkdirSync(cache, { recursive: true });
  // 98% do alvo: o PDF fica um pouco abaixo de N MiB, senão o de 300 MiB passaria do limite seguro.
  const paginas = Math.floor((caso.tamanhoMiB * MiB * 0.98) / BYTES_POR_PAGINA);
  const caminho = path.join(cache, `sintetico-${paginas}p-${caso.variante.replace('+', '-')}.pdf`);
  if (!existsSync(caminho)) {
    console.log(`  gerando ${path.basename(caminho)} (${paginas} páginas)...`);
    // "imagem+texto" = digitalizado com OCR: imagem pesada e camada de texto em todas as páginas.
    const bytes = await makeSyntheticPdf({
      pages: paginas,
      bytesPerPage: BYTES_POR_PAGINA,
      withText: caso.variante === 'imagem+texto',
    });
    writeFileSync(caminho, bytes);
  }
  return { caminho, bytes: statSync(caminho).size };
}

/** Soma da memória residente dos processos do navegador, em MB; null se o sistema não permitir medir. */
function memoriaDoNavegadorMB(): number | null {
  try {
    if (process.platform === 'win32') {
      const linhas = execSync('tasklist /FO CSV /NH', { encoding: 'utf8' }).split('\n');
      let kb = 0;
      for (const linha of linhas) {
        const c = linha.split('","').map((s) => s.replace(/"/g, ''));
        if (c[0] && /chrome|msedge/i.test(c[0])) kb += Number((c[4] ?? '0').replace(/[^\d]/g, ''));
      }
      return Math.round(kb / 1024);
    }
    const saida = execSync('ps -A -o rss=,comm=', { encoding: 'utf8' });
    let kb = 0;
    for (const linha of saida.split('\n')) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(linha);
      if (m && /chrom|msedge/i.test(m[2]!)) kb += Number(m[1]);
    }
    return Math.round(kb / 1024);
  } catch {
    return null;
  }
}

interface Medida {
  caso: Caso;
  arquivoBytes: number;
  resultado?: ResultadoBench;
  travou: boolean;
  estourouTempo: boolean;
  picoMemoriaMB: number | null;
  erros: string[];
}

async function medir(caso: Caso, baseUrl: string, perfil: string, canal?: string): Promise<Medida> {
  const { caminho, bytes } = await gerarPdf(caso);
  const criterio = CRITERIOS[caso.tamanhoMiB];
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const navegador = await chromium.launch({ channel: canal, executablePath });
  const medida: Medida = { caso, arquivoBytes: bytes, travou: false, estourouTempo: false, picoMemoriaMB: null, erros: [] };

  const amostrador = setInterval(() => {
    const m = memoriaDoNavegadorMB();
    if (m !== null) medida.picoMemoriaMB = Math.max(medida.picoMemoriaMB ?? 0, m);
  }, 150);

  try {
    const pagina = await navegador.newPage();
    pagina.on('crash', () => (medida.travou = true));
    pagina.on('pageerror', (e) => medida.erros.push(e.message));
    pagina.on('response', (r) => r.status() >= 400 && medida.erros.push(`HTTP ${r.status()} ${r.url()}`));
    pagina.on('console', (m) => {
      // "Failed to load resource" não diz qual; a linha "HTTP <status> <url>" acima já diz.
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) medida.erros.push(m.text());
    });
    await pagina.goto(`${baseUrl}bench/harness.html?perfil=${perfil}`);
    await pagina.setInputFiles('#arquivo', caminho);
    try {
      await pagina.waitForFunction(() => Boolean((window as unknown as { __bench?: unknown }).__bench), undefined, {
        timeout: criterio.tempoMaxMs * 1.2,
        polling: 1000,
      });
      medida.resultado = await pagina.evaluate(() => (window as unknown as { __bench: ResultadoBench }).__bench);
    } catch (erro) {
      if (!medida.travou) medida.estourouTempo = true;
      medida.erros.push(erro instanceof Error ? erro.message.split('\n')[0]! : String(erro));
    }
  } finally {
    clearInterval(amostrador);
    medida.erros = [...new Set(medida.erros)].slice(0, 3);
    const versao = navegador.version();
    await navegador.close();
    (medida as Medida & { versao?: string }).versao = versao;
  }
  return medida;
}

function veredito(m: Medida): { passou: boolean; motivo: string } {
  const criterio = CRITERIOS[m.caso.tamanhoMiB];
  const r = m.resultado;
  if (m.travou) return { passou: false, motivo: 'a aba travou (crash)' };
  if (m.estourouTempo || !r) return { passou: false, motivo: `não concluiu em ${criterio.tempoMaxMs / 1000} s (+20%)` };
  if (!r.ok) return { passou: false, motivo: r.motivo ?? 'resultado inválido' };
  if (r.tempoMs > criterio.tempoMaxMs) return { passou: false, motivo: `demorou ${(r.tempoMs / 1000).toFixed(0)} s` };
  if (criterio.congelamentoMaxMs !== undefined && r.maxCongelamentoMs > criterio.congelamentoMaxMs) {
    return { passou: false, motivo: `tela congelou ${r.maxCongelamentoMs} ms` };
  }
  return { passou: true, motivo: 'ok' };
}

function formatar(medidas: Medida[], perfil: string, canal: string | undefined, versao: string): string {
  const mb = (n: number) => (n / MiB).toFixed(1);
  const linhas = medidas.map((m) => {
    const v = veredito(m);
    const r = m.resultado;
    return `| ${m.caso.tamanhoMiB} MB, ${m.caso.variante} | ${mb(m.arquivoBytes)} MB | ${r?.paginas ?? '-'} | ${
      r ? `${(r.tempoMs / 1000).toFixed(1)} s` : '-'
    } | ${r ? `${r.maxCongelamentoMs} ms` : '-'} | ${r?.partes ?? '-'} | ${r?.maiorParteBytes ? `${mb(r.maiorParteBytes)} MB` : '-'} | ${
      m.picoMemoriaMB === null ? 'não medido' : `${m.picoMemoriaMB} MB`
    } | ${v.passou ? 'PASSOU' : `FALHOU (${v.motivo})`} |`;
  });
  const geral = medidas.every((m) => veredito(m).passou);
  return `# Portão técnico: ${new Date().toISOString().slice(0, 10)}

**Resultado geral: ${geral ? 'PASSOU' : 'FALHOU'}**

## Ambiente

- Sistema: ${os.platform()} ${os.release()} (${os.arch()})
- CPU: ${os.cpus()[0]?.model ?? '?'} (${os.cpus().length} núcleos)
- Memória total: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB
- Navegador: ${canal ?? 'Chromium do Playwright'} ${versao}
- Perfil usado: ${perfil}
- Node: ${process.version}

## Critérios (plano, Task 4)

- 100 MB: concluir em até 180 s, tela sem congelar mais de 500 ms, sem crash.
- 300 MB: concluir em até 900 s, sem crash.

## Resultados

| Caso | Arquivo | Páginas | Tempo | Maior congelamento | Partes | Maior parte | Pico de memória do navegador | Veredito |
|---|---|---|---|---|---|---|---|---|
${linhas.join('\n')}

## Como ler

- "Maior congelamento" é o maior atraso de um batimento de 100 ms na thread principal.
- "Pico de memória" soma a memória residente de todos os processos do navegador, amostrada a cada 150 ms.
  "Não medido" significa que o sistema não permitiu a leitura.
- Os PDFs são sintéticos (páginas de ~500 KB de imagem incompressível; "imagem+texto" simula digitalização com OCR).
`;
}

async function principal(): Promise<void> {
  const canal = argumento('channel');
  const perfil = argumento('perfil') ?? 'tjgo-projudi';
  const so = argumento('only');
  const casos: Caso[] = ([100, 300] as const)
    .filter((t) => !so || String(t) === so)
    .flatMap((tamanhoMiB) => (['imagem', 'imagem+texto'] as const).map((variante) => ({ tamanhoMiB, variante })));

  console.log('Compilando o harness...');
  const dist = path.join(cache, 'dist');
  await build({
    root: raiz,
    configFile: false,
    logLevel: 'warn',
    worker: { format: 'es' },
    build: { outDir: dist, emptyOutDir: true, target: 'es2022', rollupOptions: { input: path.join(raiz, 'bench/harness.html') } },
  });
  const servidor = await preview({ root: raiz, configFile: false, build: { outDir: dist }, preview: { host: '127.0.0.1' } });
  const baseUrl = servidor.resolvedUrls!.local[0]!;

  const medidas: Medida[] = [];
  let versao = '';
  try {
    for (const caso of casos) {
      console.log(`\n${caso.tamanhoMiB} MB, ${caso.variante}`);
      const m = await medir(caso, baseUrl, perfil, canal);
      versao = (m as Medida & { versao?: string }).versao ?? versao;
      const v = veredito(m);
      console.log(`  ${v.passou ? 'PASSOU' : 'FALHOU'}: ${v.motivo}`, m.resultado ?? '', m.erros.length ? `\n  erros: ${m.erros.join(' | ')}` : '');
      medidas.push(m);
    }
  } finally {
    await servidor.close();
  }

  const pasta = path.join(raiz, 'docs/benchmarks');
  mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `${new Date().toISOString().slice(0, 10)}-portao.md`);
  writeFileSync(arquivo, formatar(medidas, perfil, canal, versao));
  console.log(`\nRelatório: ${path.relative(raiz, arquivo)}`);
  process.exit(medidas.every((m) => veredito(m).passou) ? 0 : 1);
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(2);
});
