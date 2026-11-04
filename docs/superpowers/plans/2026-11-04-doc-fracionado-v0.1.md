# Doc Fracionado v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app 100% no navegador que divide PDFs em partes que cumprem o limite de um perfil de tribunal (Projudi-TJGO, PJe-TRF1) e entrega um relatório de conformidade.

**Architecture:** Site estático (Vite + TypeScript, sem framework) hospedado no GitHub Pages. O núcleo (perfis, diagnóstico, divisor, relatório, ZIP) são módulos puros e testáveis em Node; um Web Worker os executa no navegador. O portão técnico dos PDFs grandes (Task 4) vem antes da interface e pode mudar o desenho.

**Tech Stack:** TypeScript (strict), Vite, Vitest, `pdf-lib`, `pdfjs-dist`, `fflate`, `ajv` (só dev/CI), `@playwright/test`, GitHub Actions. Node LTS (≥ 20). Versões exatas ficam no `package-lock.json`.

**Spec:** `docs/superpowers/specs/2026-11-04-doc-fracionado-design.md`

## Global Constraints

- Interface, mensagens e documentação em português do Brasil.
- Sem servidor, sem analytics, sem fontes externas. CSP via `<meta>` com `connect-src 'none'`: nenhuma requisição de rede após o carregamento.
- Margem de segurança padrão: o divisor mira **95%** do limite declarado (`margem = 0.05`), configurável.
- Frase fixa em toda saída do relatório: `Confira o limite na tela de envio do tribunal.`
- Perfil com `verificado_em` anterior a **180 dias** é marcado como possivelmente desatualizado.
- Nome das partes: `NomeOriginal_parte01de09.pdf`.
- O divisor corta só em limite de página, preserva a ordem e nunca altera o conteúdo das páginas.
- Perfil sem `fonte` e sem `verificado_em` não é aceito.
- Testes usam apenas PDFs sintéticos gerados no próprio teste. Nenhum documento real.
- Licença MIT. Repositório `doc-fracionado`, conta `ragrezende`. Commits usam a identidade já configurada no repositório local.
- Convenção de nomes: campos de perfil seguem o JSON do spec (`snake_case`); o restante do TypeScript usa `camelCase` em português.

## Review Focus

Entradas que o spec não menciona e que mais provavelmente quebram o uso real, da mais provável para a menos:

1. **Arquivo que não é PDF, está vazio ou tem 0 páginas:** mensagem clara, nunca exceção solta. Teste na Task 2.
2. **PDF com assinatura digital:** dividir invalida a assinatura. A ferramenta avisa em vez de calar. Testes nas Tasks 2 e 5.
3. **Links internos e destinos que apontam para outras páginas:** `copyPages` pode puxar páginas extras para a parte e estourar contagem e tamanho. Teste na Task 3.
4. **PDF que já cabe no limite:** devolvido byte a byte idêntico, sem reserializar. Teste na Task 3.
5. **Nome de arquivo com acentos, espaços ou `.PDF` maiúsculo:** nome das partes correto e ZIP com nomes em UTF-8. Testes na Task 5.

---

## File Structure

```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts  playwright.config.ts
index.html                      # CSP meta + ponto de montagem da UI
profiles/schema.json            # JSON Schema (CI)
profiles/tjgo-projudi.json  profiles/trf1-pje.json   # conteúdo da seção 4 do spec
src/profiles/{types,parse,rules,load}.ts
src/pdf/{pdfjs,diagnose,split,names,zip}.ts
src/report/report.ts
src/worker/{processar,protocol,processar.worker}.ts
src/ui/{main,view,strings}.ts
tests/helpers/{syntheticPdf,fixtures}.ts
tests/unit/*.test.ts   tests/e2e/*.spec.ts
bench/{harness.html,harness.ts,run.ts}   docs/benchmarks/
scripts/{validate-profiles.mjs,check-licenses.mjs}
.github/workflows/{ci.yml,pages.yml}
README.md  CONTRIBUTING.md
```

Cada arquivo tem uma responsabilidade. `src/profiles/*` não conhece PDF; `src/pdf/*` conhece perfil só por `rules.ts`.

---

### Task 1: Base do projeto e perfis

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `.github/workflows/ci.yml`, `scripts/validate-profiles.mjs`, `scripts/check-licenses.mjs`, `profiles/schema.json`, `profiles/tjgo-projudi.json`, `profiles/trf1-pje.json`, `src/profiles/{types,parse,rules,load}.ts`
- Test: `tests/unit/profiles.test.ts`

**Interfaces:**
- Produces (`src/profiles/types.ts`):
  ```ts
  export type Confianca = 'oficial' | 'noticia_nao_oficial' | 'reportado_por_usuario';
  export type Restricao =
    | { tipo: 'tamanho_maximo_arquivo'; bytes: number }
    | { tipo: 'media_maxima_por_pagina'; quando_arquivo_entre_bytes?: [number, number]; bytes_por_pagina: number }
    | { tipo: 'max_arquivos_por_peticionamento'; quantidade: number }
    | { tipo: 'texto_pesquisavel'; nivel: 'aviso' };
  export interface Perfil { id: string; tribunal: string; sistema: string; restricoes: Restricao[];
    confianca: Confianca; fonte: string; verificado_em: string; observacoes: string; lembretes: string[] }
  ```
- Produces (`parse.ts`): `parsePerfil(json: unknown): Perfil` (lança `PerfilInvalidoError` com o caminho do campo) e `estaDesatualizado(p: Perfil, agora: Date, dias = 180): boolean`.
- Produces (`rules.ts`): `limiteEfetivoBytes(p: Perfil, margem = 0.05): number` e `parteCumpre(p: Perfil, bytes: number, paginas: number, margem = 0.05): boolean`.
- Produces (`load.ts`): `carregarPerfis(): Perfil[]`, via `import.meta.glob('../../profiles/*.json', { eager: true })`, ignorando `schema.json`.

- [ ] **Step 1: Scaffold.** `npm init`, instalar as dependências da Tech Stack, `tsconfig` com `strict: true`, scripts `test`, `typecheck`, `build`, `validate:profiles`, `check:licenses`, `e2e`, `bench`. `vitest.config.ts` com alias `pdfjs-dist` → `pdfjs-dist/legacy/build/pdf.mjs` (necessário em Node). `ci.yml` roda `typecheck`, `test`, `validate:profiles`, `check:licenses`, `build` em push e PR.
- [ ] **Step 2: Escrever `tests/unit/profiles.test.ts` (falha).** Casos, com os valores do spec:
  - os dois arquivos de `profiles/` passam em `parsePerfil`;
  - `parsePerfil` rejeita: `fonte` vazia; `verificado_em` ausente ou fora de `AAAA-MM-DD`; `tipo` de restrição desconhecido; zero ou dois `tamanho_maximo_arquivo`; `bytes` ≤ 0;
  - `estaDesatualizado` para `verificado_em: '2026-11-02'`: `agora = 2027-05-01` → `false`; `agora = 2027-05-02` → `true` (use `Date.UTC`);
  - `limiteEfetivoBytes(tjgo) === 11953766` e `limiteEfetivoBytes(trf1) === 19922944`;
  - `parteCumpre(tjgo, 3_000_000, 1) === true`; `(tjgo, 10_000_000, 3) === false`; `(tjgo, 10_000_000, 6) === true`; `(tjgo, 11_953_766, 100) === true`; `(tjgo, 11_953_767, 100) === false`; `(tjgo, 4_194_304, 1) === true` (faixa da média é `bytes > min && bytes <= max`).
  - paridade: `scripts/validate-profiles.mjs` (ajv contra `profiles/schema.json`) aceita os dois perfis e rejeita os mesmos casos inválidos de `parsePerfil`.
- [ ] **Step 3: Rodar `npx vitest run tests/unit/profiles.test.ts`.** Esperado: FALHA (módulos inexistentes).
- [ ] **Step 4: Implementar os módulos acima e os dois JSON de perfil**, copiando os conteúdos exatos da seção 4 do spec. Validador em runtime escrito à mão em `parse.ts`: `ajv` gera código com `new Function` e quebraria sob a CSP, então fica só em `scripts/validate-profiles.mjs` (CI).
- [ ] **Step 5: Implementar `scripts/check-licenses.mjs`:** lê `npm ls --omit=dev --all --json`, falha se alguma dependência de produção tiver licença fora de `MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC`. Rodar e registrar o resultado no commit (cobre a verificação pendente de licenças da seção 12 do spec).
- [ ] **Step 6: Rodar `npm test && npm run validate:profiles && npm run check:licenses && npm run typecheck`.** Esperado: tudo passa.
- [ ] **Step 7: Commit** `feat: base do projeto, perfis e regras`.

---

### Task 2: Fixtures sintéticos e diagnóstico

**Files:**
- Create: `tests/helpers/syntheticPdf.ts`, `tests/helpers/fixtures.ts`, `src/pdf/pdfjs.ts`, `src/pdf/diagnose.ts`
- Test: `tests/unit/diagnose.test.ts`

**Interfaces:**
- Produces (`syntheticPdf.ts`): `makeSyntheticPdf(o: { pages: number; bytesPerPage: number | ((i: number) => number); withText?: boolean | ((i: number) => boolean) }): Promise<Uint8Array>`. A página `i` (base 0) tem largura `200 + i` e altura `300`; o peso vem de um XObject de imagem `DeviceGray` sem filtro com bytes aleatórios (incompressível). `readPageWidths(bytes: Uint8Array): Promise<number[]>` devolve as larguras na ordem.
- Produces (`fixtures.ts`): `encryptedMinimalPdf(): Uint8Array` (PDF mínimo escrito à mão, com `/Encrypt` no trailer), `signedLikePdf(): Promise<Uint8Array>` (AcroForm com `SigFlags 3` e campo `FT /Sig`), `pdfWithInternalLink(): Promise<Uint8Array>` (6 páginas; link da página 1 com `/Dest` para a página 5), `pdfWithInheritedMediaBox(): Promise<Uint8Array>` (`MediaBox` só no nó `Pages`).
- Produces (`diagnose.ts`):
  ```ts
  export interface Diagnostico { paginas: number; bytesTotal: number; pesoPorPaginaEstimado: number[];
    paginasComTexto: number; textoPesquisavel: 'sim' | 'parcial' | 'nao'; possuiAssinaturaDigital: boolean }
  export class PdfProtegidoError extends Error {}
  export class PdfInvalidoError extends Error {}   // não é PDF, corrompido ou sem páginas
  export function diagnose(bytes: Uint8Array): Promise<Diagnostico>
  ```
- `pdfjs.ts` abre documentos com `isEvalSupported: false` (a CSP proíbe `eval`).

- [ ] **Step 1: Escrever `diagnose.test.ts` (falha).**
  - 3 páginas com pesos `[1_000, 500_000, 1_000]`: `pesoPorPaginaEstimado[1] >= 500_000` e os outros dois `< 50_000`; `paginas === 3`.
  - `withText: true` → `textoPesquisavel === 'sim'`; `false` → `'nao'`; só a página 0 com texto → `'parcial'` e `paginasComTexto === 1`.
  - `diagnose(encryptedMinimalPdf())` rejeita com `PdfProtegidoError`.
  - `diagnose(new TextEncoder().encode('isto nao e um pdf'))`, `diagnose(new Uint8Array())` e um PDF de 0 páginas rejeitam com `PdfInvalidoError` e mensagem em português.
  - `signedLikePdf()` → `possuiAssinaturaDigital === true`; PDF comum → `false`.
- [ ] **Step 2: Rodar `npx vitest run tests/unit/diagnose.test.ts`.** Esperado: FALHA.
- [ ] **Step 3: Implementar os helpers e `diagnose`.** Peso estimado por página = soma dos tamanhos dos streams alcançáveis a partir de `Contents` e `Resources` da página (fontes e imagens compartilhadas contam em cada página que as usa; é estimativa e a UI a rotula assim). Texto via `getTextContent()` de cada página, contando páginas com algum caractere não-espaço. Assinatura: `AcroForm` com campo `FT /Sig` ou `SigFlags`.
- [ ] **Step 4: Rodar os testes.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: fixtures sinteticos e diagnostico de PDF`.

---

### Task 3: Divisor

**Files:**
- Create: `src/pdf/split.ts`
- Test: `tests/unit/split.test.ts`

**Interfaces:**
- Consumes: `Perfil`, `limiteEfetivoBytes`, `parteCumpre` (Task 1); `diagnose`, `makeSyntheticPdf`, `readPageWidths` e fixtures (Task 2).
- Produces:
  ```ts
  export interface Parte { indice: number; primeiraPagina: number; ultimaPagina: number; bytes: Uint8Array } // páginas base 1, inclusivas
  export type ResultadoDivisao =
    | { ok: true; partes: Parte[] }
    | { ok: false; paginaProblematica: number; bytesDaPagina: number }
  export function splitPdf(origem: Uint8Array, perfil: Perfil, opts?: { margem?: number;
    onProgresso?: (paginasProcessadas: number, total: number) => void }): Promise<ResultadoDivisao>
  ```

Algoritmo (a assinatura e os testes não o determinam): para cada parte, partir de uma contagem inicial `n` estimada com `pesoPorPaginaEstimado`; **medir o tamanho real** gerando a parte com `copyPages` + `save`; manter `lo` (maior `n` que cabe) e `hi` (menor que não cabe) e reajustar `n` proporcionalmente ao limite; aceitar a primeira medição que caiba e ocupe ≥ 97% do limite efetivo, ou parar quando `hi - lo <= 1`. "Cabe" = `bytes <= limiteEfetivoBytes`. Como `parteCumpre` pode envolver a regra de média por página, que não é monótona, depois de achar o maior `n` que cabe em tamanho, decrementar até `parteCumpre` ser verdadeiro. Se `n = 1` ainda não cumpre, devolver `{ ok: false, ... }`.

- [ ] **Step 1: Escrever `split.test.ts` (falha).** Perfil de teste com `tamanho_maximo_arquivo: 3_000_000` (limite efetivo 2_850_000) e sem outras restrições:
  - 10 páginas de 1_000_000 bytes → 5 partes de 2 páginas; cada `bytes.length <= 2_850_000`; soma das páginas = 10; `readPageWidths` concatenado das partes é `[200 … 209]` (ordem preservada).
  - 1 página de 5_000_000 → `{ ok: false, paginaProblematica: 1 }`.
  - Perfil TJGO real, 4 páginas de 2_500_000 → 4 partes de 1 página (duas páginas dariam média 2,5 MB, acima de 1.992.294 por página).
  - **PDF que já cabe** (3 páginas pequenas): 1 parte cujo `bytes` é idêntico ao `origem` (`toEqual`).
  - **Link interno** (`pdfWithInternalLink`, limite que força partes de 2 páginas): nenhuma parte tem páginas além das esperadas; soma = 6; links internos podem ser descartados.
  - **MediaBox herdado** (`pdfWithInheritedMediaBox`): `readPageWidths` das partes iguala o original.
  - `onProgresso` é chamado com `paginasProcessadas` crescente, terminando em `total`.
- [ ] **Step 2: Rodar `npx vitest run tests/unit/split.test.ts`.** Esperado: FALHA.
- [ ] **Step 3: Implementar `splitPdf`** conforme o algoritmo. Antes de `copyPages`, descartar da página copiada as anotações `Link` com `/Dest` ou ação `GoTo`, para que a cópia não arraste outras páginas. Se o PDF inteiro já cumpre, retornar uma única parte com os bytes originais, sem reserializar.
- [ ] **Step 4: Rodar os testes.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: divisor de PDF com medicao real das partes`.

---

### Task 4: Worker e portão técnico

**Files:**
- Create: `src/worker/{processar,protocol,processar.worker}.ts`, `bench/{harness.html,harness.ts,run.ts}`, `docs/benchmarks/.gitkeep`
- Test: `tests/unit/processar.test.ts`

**Interfaces:**
- Consumes: `diagnose`, `splitPdf`, `Perfil`.
- Produces (`protocol.ts`):
  ```ts
  export const LIMITE_SEGURO_BYTES = 300 * 1024 * 1024;
  export function validarTamanho(bytes: number): { ok: true } | { ok: false; mensagem: string }
  export type Pedido = { tipo: 'processar'; arquivo: ArrayBuffer; perfil: Perfil; margem: number }
  export type Resposta =
    | { tipo: 'progresso'; etapa: 'diagnostico' | 'divisao'; feito: number; total: number }
    | { tipo: 'diagnostico'; diagnostico: Diagnostico }
    | { tipo: 'resultado'; resultado: ResultadoDivisao }
    | { tipo: 'erro'; codigo: 'protegido' | 'invalido' | 'grande_demais' | 'interno'; mensagem: string }
  ```
- Produces (`processar.ts`): `processarArquivo(bytes: Uint8Array, perfil: Perfil, margem: number, emitir: (r: Resposta) => void): Promise<void>`, função pura usada pelo worker e pelos testes. `processar.worker.ts` só liga `postMessage` a ela, transferindo os `ArrayBuffer`s.

- [ ] **Step 1: Escrever `processar.test.ts` (falha).** `validarTamanho(300 * 1024 * 1024)` é `ok`; `validarTamanho(300 * 1024 * 1024 + 1)` devolve `ok: false` com a mensagem `Arquivo grande demais para processar com segurança neste navegador.`; com um PDF sintético, `processarArquivo` emite `diagnostico` antes de `resultado`, `progresso` nunca decresce e `feito <= total`; com `encryptedMinimalPdf` emite `erro` com `codigo: 'protegido'`; com lixo, `codigo: 'invalido'`.
- [ ] **Step 2: Rodar o teste.** Esperado: FALHA.
- [ ] **Step 3: Implementar `protocol.ts`, `processar.ts` e o worker.** Erros do núcleo viram `Resposta` de `erro`; qualquer outra exceção vira `interno`.
- [ ] **Step 4: Rodar o teste.** Esperado: PASS. Commit `feat: worker de processamento e guarda de tamanho`.
- [ ] **Step 5: Implementar o harness do portão.** `bench/run.ts` (Playwright + Chromium; opção `--channel msedge`): gera em disco PDFs sintéticos de **100 MB** e **300 MB**, cada um em duas variantes (páginas de imagem pesada e páginas com texto), carrega `bench/harness.html` (usa o mesmo worker), envia o arquivo, e mede tempo total, o maior intervalo de tela congelada na thread principal (heartbeat de 100 ms) e se houve `crash` da página ou erro do worker. Escreve `docs/benchmarks/AAAA-MM-DD-portao.md` com a tabela.
- [ ] **Step 6: Critérios do portão, decididos aqui (revisáveis pelo autor):** 100 MB passa se concluir em até **180 s**, com intervalo máximo de congelamento ≤ **500 ms** e sem crash; 300 MB passa se concluir em até **900 s** sem crash. Memória de pico não é medida de forma exata (a memória de buffers fica fora do heap JS); o relatório registra o heap indicativo. Se o resultado ficar no limite, medir à mão no Gerenciador de Tarefas.
- [ ] **Step 7: Rodar `npm run bench`** no computador do autor (a CI não substitui a máquina real de 8 GB).
- [ ] **Step 8: CHECKPOINT. Parar e mostrar a tabela ao autor.** Só seguir para a Task 5 com a decisão dele: aprovado, ou mudar o desenho (processar por faixas de páginas, ou antecipar o módulo WebAssembly, conforme a seção 8 do spec). Se o resultado exigir outro `LIMITE_SEGURO_BYTES`, ajustar a constante e seu teste. Commit `test: harness do portao tecnico e resultados`.

---

### Task 5: Relatório, nomes e ZIP

**Files:**
- Create: `src/pdf/names.ts`, `src/pdf/zip.ts`, `src/report/report.ts`
- Test: `tests/unit/report.test.ts`, `tests/unit/names.test.ts`, `tests/unit/zip.test.ts`

**Interfaces:**
- Consumes: `Perfil`, `estaDesatualizado`, `parteCumpre`, `Parte`, `Diagnostico`.
- Produces:
  ```ts
  // names.ts
  export function nomeBase(nomeArquivo: string): string               // remove a extensão .pdf, qualquer caixa
  export function nomeDaParte(base: string, indice: number, total: number): string
  // zip.ts
  export function montarZip(arquivos: { nome: string; bytes: Uint8Array }[]): Uint8Array   // fflate, nível 0
  // report.ts
  export const FRASE_FIXA = 'Confira o limite na tela de envio do tribunal.';
  export interface RelatorioParte { nome: string; bytes: number; paginas: number; cumpre: boolean }
  export interface Relatorio { perfilId: string; confianca: Confianca; fonte: string; verificadoEm: string;
    desatualizado: boolean; partes: RelatorioParte[]; avisos: string[]; lembretes: string[]; fraseFixa: string }
  export function gerarRelatorio(a: { perfil: Perfil; nomeBase: string; partes: Parte[];
    diagnostico: Diagnostico; agora: Date }): Relatorio
  ```

- [ ] **Step 1: Escrever os testes (falham).**
  - `names`: `nomeDaParte('Volume1', 1, 9) === 'Volume1_parte01de09.pdf'`; `nomeDaParte('V', 7, 120) === 'V_parte007de120.pdf'`; `nomeBase('Petição inicial.PDF') === 'Petição inicial'`; `nomeBase('sem-extensao') === 'sem-extensao'`.
  - `zip`: `unzipSync(montarZip(x))` devolve os mesmos nomes e bytes; para o nome `Petição inicial_parte01de02.pdf`, o bit 11 (`0x0800`) das flags do cabeçalho local está ligado (nomes em UTF-8).
  - `report`: `cumpre` usa o limite **declarado**, sem a margem (uma parte de 12_000_000 bytes no TJGO cumpre; uma de 12_600_000 não); `desatualizado` segue os 180 dias; mais de 40 partes no perfil TRF1 gera aviso; `diagnostico.textoPesquisavel !== 'sim'` gera aviso no TRF1 e nenhum no TJGO; `possuiAssinaturaDigital` gera aviso informando que dividir invalida a assinatura; `lembretes` e `fraseFixa` sempre presentes; `confianca`, `fonte` e `verificadoEm` copiados do perfil.
- [ ] **Step 2: Rodar `npx vitest run tests/unit`.** Esperado: FALHA nos três arquivos novos.
- [ ] **Step 3: Implementar os três módulos.**
- [ ] **Step 4: Rodar `npx vitest run tests/unit`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: relatorio de conformidade, nomes das partes e ZIP`.

---

### Task 6: Interface, CSP e testes de ponta a ponta

**Files:**
- Create: `index.html`, `src/ui/{main,view,strings}.ts`, `playwright.config.ts`, `tests/e2e/{fluxo,privacidade}.spec.ts`
- Modify: `vite.config.ts` (`base: '/doc-fracionado/'`), `.github/workflows/ci.yml` (job `e2e`)

**Interfaces:**
- Consumes: `carregarPerfis`, `Pedido`/`Resposta`, `validarTamanho`, `gerarRelatorio`, `nomeBase`, `nomeDaParte`, `montarZip`.
- `strings.ts` concentra todo o texto em pt-BR. Fluxo: carregar PDF → escolher perfil → ver diagnóstico (rótulo "peso estimado por página") → gerar partes → ver relatório → baixar ZIP. A confiança e a data de verificação do perfil aparecem ao lado do seletor, com aviso quando desatualizado. Se o arquivo já cumpre o perfil, a tela diz isso e oferece o original sem alterações.
- CSP em `index.html`: `default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'`.
- Escolher outro arquivo durante o processamento encerra o worker e descarta o resultado em andamento.

- [ ] **Step 1: Escrever os testes e2e (falham).**
  - `fluxo`: PDF sintético de 12 páginas × 1_000_000 bytes com o perfil `tjgo-projudi` → o ZIP baixado contém `…_parte01de02.pdf` e `…_parte02de02.pdf`, e as larguras de página, concatenadas, são `[200 … 211]`; o relatório na tela mostra a frase fixa, a confiança `noticia_nao_oficial` e a data do perfil.
  - `fluxo`: `encryptedMinimalPdf` mostra a mensagem de PDF protegido e nenhum botão de download.
  - `privacidade`: após o carregamento da página, nenhuma requisição além dos assets estáticos de mesma origem; `fetch('https://example.com')` executado na página é bloqueado pela CSP; o `index.html` construído contém `connect-src 'none'`.
- [ ] **Step 2: Rodar `npm run e2e`.** Esperado: FALHA.
- [ ] **Step 3: Implementar a UI sem framework**, usando o worker da Task 4.
- [ ] **Step 4: Rodar `npm run build && npm run e2e`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: interface em portugues, CSP e testes e2e`.

---

### Task 7: Documentação, deploy e checklist de lançamento

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `.github/workflows/pages.yml`
- Modify: `docs/superpowers/specs/2026-11-04-doc-fracionado-design.md` (atualizar a seção 12 conforme os resultados)

- [ ] **Step 1: `README.md` em pt-BR:** o que é, a promessa de privacidade e como verificá-la (CSP e aba de rede), como usar, aviso de que a ferramenta não oferece garantia de aceite, as limitações conhecidas (links e marcadores internos não são preservados entre partes; assinatura digital é invalidada; não há OCR nem compressão), e a tabela de perfis com confiança e data.
- [ ] **Step 2: `CONTRIBUTING.md`:** como propor ou corrigir um perfil (copiar um existente, preencher `fonte` e `verificado_em`, rodar `npm run validate:profiles`), e como propor um tipo de restrição novo.
- [ ] **Step 3: `pages.yml`:** build e publicação no GitHub Pages. Pages em repositório privado exige plano pago, então o workflow só funciona após o repositório se tornar público.
- [ ] **Step 4: Checklist de lançamento (humano, antes de tornar o repositório público):** (a) colisão do nome "Doc Fracionado" com outro projeto ou marca, buscando no GitHub e no INPI; (b) procurar página oficial do TJGO com o limite do Projudi e, se existir, subir a `confianca` do perfil; (c) conferir se a Portaria Presi TRF1 8016281 foi alterada depois da cópia de 2019; (d) confirmar a decisão sobre o e-mail público dos commits (e-mail de dev ou `noreply` do GitHub); (e) rodar `npm run bench` de novo e anexar o resultado.
- [ ] **Step 5: Rodar `npm test && npm run e2e && npm run build`.** Esperado: tudo passa.
- [ ] **Step 6: Commit** `docs: README, guia de contribuicao, deploy e checklist de lancamento`.
