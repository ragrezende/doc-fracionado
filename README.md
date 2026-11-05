# Doc Fracionado

Divide PDFs grandes em partes que cabem no limite do sistema de peticionamento eletrônico de um tribunal, **direto no navegador**. Seus arquivos não saem do computador.

Feito para advogados que protocolam volumes pesados no Projudi e no PJe e precisam fracionar o arquivo sem enviá-lo a um site de terceiros, o que é um problema de sigilo profissional e de LGPD.

## Como usar

Funciona nos navegadores atuais (Chrome, Edge, Firefox, Safari). O pdf.js é usado na versão compatível com navegadores mais antigos, e há um teste que simula um Chrome/Edge anterior à versão 128.

1. Abra a página.
2. Escolha o **perfil do tribunal** (por exemplo, TJGO · Projudi).
3. Escolha o **arquivo PDF**.
4. Leia o diagnóstico e o relatório: ele mostra cada parte, o tamanho, os avisos e os lembretes do perfil.
5. Baixe o **ZIP** com as partes (ou o PDF original, quando ele já cumpre o perfil).

As partes recebem o nome `NomeOriginal_parte01de09.pdf`. A divisão corta só no limite entre páginas, preserva a ordem e não altera o conteúdo das páginas.

## Privacidade, e como conferir

Tudo acontece no seu navegador. O site é estático, não tem servidor, não usa analytics e não carrega nada de terceiros. A página é servida com uma política de segurança (CSP) que proíbe qualquer requisição de rede depois do carregamento, **inclusive dentro dos processos em segundo plano (workers) que leem o PDF**: eles são criados de forma a herdar essa política, e um teste confere que um `fetch` feito dentro de cada um é bloqueado.

Você não precisa confiar nisso, pode verificar:

- Abra as ferramentas do navegador (F12), vá na **aba Rede** e processe um arquivo: só aparecem requisições aos arquivos do próprio site (o código da página e do processador de PDF). Nenhum byte do seu arquivo é enviado a lugar nenhum.
- O código é aberto e está neste repositório. A CSP está no `index.html`, e os testes em `tests/e2e/privacidade.spec.ts` a conferem.

## O que a ferramenta não faz

- **Não oferece garantia de que o tribunal aceitará o arquivo.** Ela confere o PDF contra o limite do perfil escolhido, e os limites mudam. Confira o limite na tela de envio do tribunal.
- **Links e marcadores internos não sobrevivem à divisão.** Links que apontam para outra página do mesmo PDF são removidos das partes, e o sumário/marcadores do PDF não são copiados.
- **Formulários preenchíveis e camadas opcionais do PDF não são preservados** nas partes. Em PDFs de autos isso é raro, mas se o seu arquivo os usa, confira as partes.
- **Assinatura digital:** dividir um PDF assinado invalida a assinatura nas partes geradas. A ferramenta avisa quando detecta uma.
- **Não faz OCR nem compressão de PDF.** Se uma única página, sozinha, não cabe no limite, a ferramenta informa qual é; ela precisa ser reduzida antes.
- **Arquivos acima de 300 MB são recusados**, com mensagem clara.
- **PDFs protegidos por senha** não são processados (e a ferramenta nunca tenta contornar a proteção).
- Não analisa nem interpreta o conteúdo jurídico dos documentos.

## Perfis de tribunal

Cada tribunal é um arquivo em [`profiles/`](profiles), com a fonte do limite e a data da verificação. A ferramenta mostra a confiança do perfil na tela e avisa quando a verificação tem mais de 180 dias.

| Perfil | Limite | Confiança | Verificado em |
|---|---|---|---|
| TJGO · Projudi | 12 MB por arquivo; em arquivos de 4 a 12 MB, média de até 2 MB por página | Notícia, não oficial | 02/11/2026 |
| TRF1 · PJe | 20 MB por arquivo; até 40 arquivos por peticionamento | Informado por usuário | 04/11/2026 |
| TRTs (todos os regionais) · PJe-JT | 10 MB por arquivo (Ato Conjunto TST.CSJT 48/2021) | Fonte oficial | 05/11/2026 |
| TJSP · e-SAJ | 10 MB por arquivo, o menor valor documentado: as fontes do tribunal se contradizem | Fonte oficial | 05/11/2026 |
| TJSP · eproc | 11 MB por arquivo, de um manual escrito para Ministério Público e Defensoria | Fonte oficial | 05/11/2026 |

Dois avisos sobre esses perfis. O de **TJSP · e-SAJ** usa o menor limite que as fontes documentam: se o real for maior, você recebe mais partes do que precisaria, o que é inofensivo. E o de **TJSP · eproc** vem de um manual escrito para outro tipo de usuário, então confira a tela de envio. Os regionais da Justiça do Trabalho (como o TRT18) seguem o mesmo ato nacional; se algum tiver regra própria, ele ganha um perfil separado.

Os limites são contados em MB binário (1 MB = 1.048.576 bytes), e o divisor mira 95% do limite como folga.

Conhece o limite de outro tribunal, ou viu um valor desatualizado? Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Desenvolvimento

Requer Node 20 ou superior.

```bash
npm ci
npm run dev        # servidor local, em http://localhost:5173/doc-fracionado/
npm test           # testes unitários
npm run e2e        # testes ponta a ponta (Playwright)
npm run typecheck
npm run build
```

O desenho está em [`docs/superpowers/specs`](docs/superpowers/specs) e o plano de implementação em [`docs/superpowers/plans`](docs/superpowers/plans). Os resultados do teste de desempenho com PDFs grandes (`npm run bench`) ficam em [`docs/benchmarks`](docs/benchmarks).

Os testes usam apenas PDFs sintéticos, gerados no próprio teste. **Nunca** coloque documentos reais de processos no repositório.

## Licença

[MIT](LICENSE).
