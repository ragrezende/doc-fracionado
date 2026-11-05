# Como contribuir

A contribuição mais valiosa é **manter os perfis de tribunal corretos**. Os limites mudam, e quem peticiona todo dia percebe antes.

## Propor ou corrigir um perfil

1. Copie um perfil existente de [`profiles/`](profiles) para um arquivo novo, por exemplo `profiles/tjsp-esaj.json`.
2. Preencha os campos. Os obrigatórios são:
   - `id`, `tribunal`, `sistema`;
   - `restricoes`: veja os tipos abaixo. Exige **exatamente um** `tamanho_maximo_arquivo`, em bytes;
   - `confianca`: `oficial` (norma ou página do próprio tribunal), `noticia_nao_oficial` (imprensa, blog) ou `reportado_por_usuario` (você viu o limite na tela de envio);
   - `fonte`: o link ou a referência normativa. **Sem fonte, o perfil não é aceito;**
   - `verificado_em`: a data em que você conferiu, no formato `AAAA-MM-DD`;
   - `observacoes` e `lembretes` (textos que a ferramenta mostra ao usuário).
3. Rode `npm run validate:profiles` e `npm test`.
4. Abra um pull request explicando de onde veio o valor. Se puder, anexe uma captura da tela de envio (sem dados de processo).

Prefira poucos perfis honestos a muitos duvidosos. Um valor que você não consegue sustentar com uma fonte não deve entrar.

### Tipos de restrição

| Tipo | Campos | Significado |
|---|---|---|
| `tamanho_maximo_arquivo` | `bytes` | Tamanho máximo de cada arquivo. |
| `media_maxima_por_pagina` | `bytes_por_pagina`, `quando_arquivo_entre_bytes` (opcional, `[mín, máx]`) | Média máxima de bytes por página, valendo só quando o arquivo está na faixa (`bytes > mín` e `bytes <= máx`). |
| `max_arquivos_por_peticionamento` | `quantidade` | Quantos arquivos cabem em um envio. |
| `texto_pesquisavel` | `nivel: "aviso"` | A ferramenta avisa se o PDF não tem camada de texto. |

Uma regra de tribunal que não caiba em nenhum tipo se resolve **propondo um tipo novo**, não escrevendo lógica dentro do perfil. Um tipo novo mexe em `profiles/schema.json`, `src/profiles/{types,parse,rules}.ts`, no relatório (`src/report/report.ts`) e nos testes correspondentes.

## Código

- Um comportamento novo começa por um teste que **falha**. Veja-o falhar pelo motivo certo antes de escrever o código.
- `npm test`, `npm run typecheck` e `npm run e2e` devem passar.
- Textos para o usuário ficam em `src/ui/strings.ts`, em português do Brasil.
- Sem estilo inline e sem `eval`: a CSP do site proíbe os dois.

## Privacidade dos testes

Os testes só usam PDFs sintéticos, gerados no próprio teste (`tests/helpers/syntheticPdf.ts`). Não envie documentos reais de processos, nem em issues nem em pull requests.
