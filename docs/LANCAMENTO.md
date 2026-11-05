# Checklist de lançamento da v0.1

O repositório nasce **privado**. Este documento lista o que só uma pessoa pode conferir ou decidir antes de torná-lo público. Marque cada item com a data e, quando couber, o resultado.

## 1. Verificações que dependem de você

- [ ] **Nome.** "Doc Fracionado" não colide com outro projeto ou marca. Busque no GitHub, no Google e no buscador de marcas do INPI. Se houver conflito, o nome do repositório e o título da página mudam *antes* do lançamento, não depois.
- [ ] **TJGO.** Existe página oficial do TJGO com o limite de PDF do Projudi (6 MB virou 12 MB segundo a imprensa jurídica)? Se existir, troque a `fonte` do perfil `tjgo-projudi`, suba a `confianca` para `oficial` e atualize `verificado_em` e o README.
- [ ] **Portaria Presi TRF1 8016281.** A cópia consultada foi impressa em 2019. Confirme no site do TRF1 se houve alterações (art. 7º, 8º e 9º) e se o campo "Arquivos suportados" do editor do PJe ainda mostra 20 MB para PDF. Atualize o perfil `trf1-pje`.
- [ ] **Volume real.** Abra um volume real do Projudi (um que você já tenha o direito de manusear) na ferramenta, no seu computador. Confira: o tempo, se a tela fica fluida, se o ZIP abre, se as partes têm as páginas na ordem certa e se o Projudi aceita as partes. Os testes de desempenho usaram PDFs sintéticos, que não têm a estrutura de um volume real.
- [ ] **Computador de 8 GB.** Rode `npm run bench -- --channel msedge` na sua máquina e guarde o relatório em `docs/benchmarks/`. O resultado anexado ao repositório foi medido em um container de 16 GB.
- [ ] **E-mail dos commits.** O histórico mostra o e-mail do autor de cada commit. Decida se publica o e-mail de desenvolvimento ou o endereço `noreply` do GitHub (Settings > Emails). Trocar *depois* exige reescrever o histórico.

- [ ] **Perfis de TJSP e TRTs** (adicionados em 05/11/2026):
  - **TJSP · e-SAJ**: alguém com acesso ao e-SAJ confere o limite na etapa "Anexar documentos" e informa. Se for maior que 10 MB, ajuste o perfil e suba a `confianca` conforme a fonte. Hoje ele usa o menor valor documentado porque as fontes se contradizem.
  - **TJSP · eproc**: confirmar se o painel de advogados tem o mesmo limite de 11 MB do manual do Ministério Público e da Defensoria.
  - **TRT18 e demais regionais**: ler o limite na tela de anexos do PJe-JT do TRT18. Se for diferente de 10 MB, criar `profiles/trt18-pje.json` (fonte `reportado_por_usuario`).

## 2. Verificações já feitas

- [x] **Licenças das dependências** (2026-11-04). `npm run check:licenses` passa: `pdf-lib` (MIT), `pdfjs-dist` (Apache-2.0), `fflate` (MIT) e as transitivas (`pako`, `tslib`) são todas permissivas. A CI repete a verificação.
- [x] **Ato 48/2021 do CSJT lido na íntegra** (05/11/2026): art. 1º fixa 10 MB por PDF no PJe, o § 2º admite dividir PDFs, e o art. 3º revoga o Ato 89/2017 (3 MB e 20 documentos).
- [x] **CSP e rede.** Os testes `tests/e2e/privacidade.spec.ts` provam que não há requisição externa, que `fetch` é bloqueado na página **e dentro de cada worker** (que são `blob:` e herdam a CSP do documento; um worker carregado de uma URL `http` não herdaria, porque o GitHub Pages não envia cabeçalho de CSP) e que o `index.html` não permite `eval` nem recursos de terceiros.
- [x] **Navegadores sem `Promise.try`** (Chrome/Edge anteriores à versão 128): `tests/e2e/navegadorAntigo.spec.ts` simula esse navegador. O build moderno do pdf.js falhava nele; o build "legacy" funciona.

## 3. Publicar

1. Em **Settings > General**, torne o repositório **público** (o GitHub Pages em repositório privado exige plano pago).
2. Em **Settings > Pages**, escolha **Source: GitHub Actions**.
3. **Publicar é automático.** O workflow `Publicar no GitHub Pages` roda a cada push no `main` (ou seja, a cada merge de PR) e também pode ser disparado à mão em **Actions > Publicar no GitHub Pages > Run workflow**. Ele roda os testes, constrói e publica em `https://<usuário>.github.io/doc-fracionado/`.

   **Tags de versão não publicam.** O ambiente `github-pages` só aceita deploys vindos do `main`: uma tag como `v0.1.0` é recusada com *"Tag … is not allowed to deploy to github-pages due to environment protection rules"*. Marcar uma versão com tag e release é opcional e não afeta o site. Se um dia quiser que tags publiquem, adicione a regra `v*` em **Settings > Environments > github-pages > Deployment branches and tags**.
4. Abra a página publicada e repita a conferência da privacidade (aba Rede, sem requisições externas) e um processamento completo.
5. Só então divulgue.
