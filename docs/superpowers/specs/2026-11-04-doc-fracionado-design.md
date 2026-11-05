# Doc Fracionado: design da v0.1

Data: 2026-11-04
Estado: aprovado em 2026-11-04; v0.1 implementada

## 1. Objetivo

Ferramenta pública e gratuita, em repositório aberto, que prepara PDFs para peticionamento eletrônico: divide um arquivo grande em partes que cabem no limite do sistema do tribunal. Roda inteiramente no navegador do advogado, sem enviar nenhum arquivo a servidor.

Sistemas de partida: **Projudi do TJGO** e **PJe do TRF1**.

Sucesso significa que advogados que não são o autor adotem a ferramenta, a recomendem a colegas e contribuam com perfis de outros tribunais.

## 2. Princípios

1. **A ferramenta não decide nada jurídico.** Só prepara arquivos. O risco de "estar juridicamente errada" não existe; o risco que resta é técnico (bug), e bug se testa.
2. **Os arquivos não saem do computador.** A promessa é imposta tecnicamente (seção 5), não apenas declarada.
3. **Limites são dados, não código.** Cada tribunal é um perfil em arquivo, com fonte e data de verificação.
4. **Honestidade sobre confiança.** Toda saída mostra de onde veio o limite e quando foi verificado. A ferramenta nunca afirma que um arquivo "será aceito", apenas que cumpre o perfil carregado.
5. **Nenhum documento real em testes.** Testes usam PDFs sintéticos.

## 3. Escopo

### Entra na v0.1

- Perfis do Projudi-TJGO e do PJe-TRF1.
- Diagnóstico do PDF: número de páginas, peso por página, existência de texto pesquisável.
- Divisor por tamanho, com medição real das partes geradas.
- Relatório de conformidade com o perfil.
- Download das partes em um ZIP.

### Fica para a v0.2

Montador: ordenar documentos, numerar folhas, gerar índice com hyperlinks.

### Fora de escopo, por decisão

- Compressão real de PDF (módulo B, só se a demanda justificar; ver seção 9).
- OCR.
- Qualquer cálculo, análise ou resumo de conteúdo jurídico.
- Qualquer servidor, conta de usuário ou armazenamento remoto.

## 4. Perfis de tribunal

Um perfil é um arquivo JSON, validado por JSON Schema em verificação automática a cada pull request.

### Tipos de restrição (conjunto fechado)

| Tipo | Significado |
|---|---|
| `tamanho_maximo_arquivo` | Bytes por arquivo. |
| `media_maxima_por_pagina` | Bytes por página, opcionalmente só quando o arquivo está numa faixa de tamanho. |
| `max_arquivos_por_peticionamento` | Quantidade de arquivos por envio. |
| `texto_pesquisavel` | Exigência ou recomendação de camada de texto; a ferramenta apenas avisa. |

Regra de tribunal que não caiba em nenhum tipo se resolve propondo um tipo novo por pull request, nunca escrevendo lógica dentro do perfil.

### Campos de metadados

- `confianca`: `oficial`, `noticia_nao_oficial` ou `reportado_por_usuario`.
- `fonte`: URL ou referência normativa.
- `verificado_em`: data (AAAA-MM-DD).
- `observacoes`: texto livre.
- `lembretes`: lista de textos que o relatório exibe ao usuário.

### Comportamento

- Perfil com `verificado_em` anterior a 180 dias mostra aviso de possível desatualização.
- Toda saída traz a frase fixa: "Confira o limite na tela de envio do tribunal."
- **Margem de segurança:** o divisor mira 95% do limite declarado, configurável. Motivo: não sabemos se cada sistema conta "MB" em base decimal ou binária.
- Perfil sem fonte e sem data não é aceito no repositório.

### Perfis iniciais

**Projudi-TJGO**

```json
{
  "id": "tjgo-projudi",
  "tribunal": "TJGO",
  "sistema": "Projudi",
  "restricoes": [
    { "tipo": "tamanho_maximo_arquivo", "bytes": 12582912 },
    {
      "tipo": "media_maxima_por_pagina",
      "quando_arquivo_entre_bytes": [4194304, 12582912],
      "bytes_por_pagina": 2097152
    }
  ],
  "confianca": "noticia_nao_oficial",
  "fonte": "https://www.rotajuridica.com.br/?p=177554",
  "verificado_em": "2026-11-02",
  "observacoes": "Página oficial do TJGO não localizada. Valores noticiados pela imprensa jurídica; data de vigência desconhecida.",
  "lembretes": ["Confira o limite exibido na tela de envio do Projudi."]
}
```

**PJe-TRF1**

```json
{
  "id": "trf1-pje",
  "tribunal": "TRF1",
  "sistema": "PJe",
  "restricoes": [
    { "tipo": "tamanho_maximo_arquivo", "bytes": 20971520 },
    { "tipo": "max_arquivos_por_peticionamento", "quantidade": 40 },
    { "tipo": "texto_pesquisavel", "nivel": "aviso" }
  ],
  "confianca": "reportado_por_usuario",
  "fonte": "Portaria Presi TRF1 8016281, art. 7º e art. 8º. Limite de 20 MB para PDF confirmado pelo autor no campo 'Arquivos suportados' do editor do PJe.",
  "verificado_em": "2026-11-04",
  "observacoes": "A cópia da Portaria consultada foi impressa em 2019; alterações posteriores não foram verificadas. O art. 7º remete o limite definitivo ao campo 'Arquivos suportados' do editor.",
  "lembretes": [
    "Marque 'peticionamento fracionado' no editor e envie as partes em ato contínuo (Portaria Presi TRF1 8016281, art. 8º).",
    "A digitalização de documentos textuais deve usar OCR, gerando dados pesquisáveis (art. 7º, § 2º)."
  ]
}
```

## 5. Arquitetura

Site estático, sem servidor, hospedado no GitHub Pages. TypeScript empacotado com Vite. O processamento pesado roda num Web Worker.

**Bibliotecas (fase 1):** `pdf-lib` para dividir e montar, `pdf.js` para inspecionar páginas e detectar camada de texto. As licenças (pelo que se sabe, MIT e Apache-2.0) devem ser confirmadas antes de adotar.

**Privacidade verificável:** a página é servida com política de segurança de conteúdo (CSP) que proíbe requisições de rede após o carregamento. Sem analytics, sem fontes externas. Qualquer pessoa pode inspecionar o código e o comportamento no navegador.

### Módulos

1. **Perfis:** carrega e valida os JSON.
2. **Diagnóstico:** páginas, peso por página, texto pesquisável.
3. **Divisor:** gera partes que cumprem o perfil (seção 6).
4. **Relatório:** por parte, informa se cumpre o perfil, com confiança, data e a frase fixa de conferência.
5. **Interface:** carregar arquivo, escolher perfil, ver diagnóstico, gerar partes, baixar ZIP.

## 6. Divisor

- Corta apenas em limite de página, preserva a ordem e nunca altera o conteúdo das páginas. Isso atende à exigência de "continuidade física e cronológica" (Portaria Presi TRF1 8016281, art. 9º).
- **Mede o tamanho real** de cada parte gerada, em vez de estimar. Fontes e imagens compartilhadas se repetem em cada parte, então a soma do peso das páginas isoladas não prevê o resultado.
- Nome das partes: `NomeOriginal_parte01de09.pdf`.
- Se uma única página sozinha já excede o limite efetivo, a ferramenta informa que essa página precisa de compressão (fora do escopo da v0.1) e não gera parte inválida.
- Se o total de partes excede `max_arquivos_por_peticionamento`, o relatório avisa.

## 7. Casos de erro

- PDF protegido por senha ou criptografia: informa e para, sem tentar contornar.
- PDF corrompido: mensagem clara.
- Arquivo acima da faixa segura definida pelo portão técnico: falha controlada com mensagem ("arquivo grande demais para processar com segurança neste navegador"), sem travar a aba.

## 8. Portão técnico

Antes de construir a interface, um protótipo mínimo processa PDFs sintéticos e mede tempo e memória em Chrome e Edge, num computador de escritório comum (assumido 8 GB de RAM, a confirmar).

| Faixa | Critério |
|---|---|
| 100 MB (caso típico de volume do Projudi) | Roda com fluidez, sem travar a aba. Sem margem para falha. |
| 300 MB (estresse) | Conclui sem derrubar o navegador, mesmo que mais lento. |
| Acima disso | Falha controlada com mensagem clara. |

Os PDFs sintéticos cobrem páginas digitalizadas (imagens pesadas) e páginas com texto.

**Hipótese a confirmar ou derrubar:** bibliotecas como `pdf-lib` carregam o documento inteiro na memória, com consumo várias vezes o tamanho do arquivo. Se os 100 MB ficarem no limite, as saídas são processar por faixas de páginas ou antecipar o módulo WebAssembly.

## 9. Fases e módulo B

Abordagem em fases: a v0.1 só com JavaScript leve; o módulo de compressão real (motor WebAssembly) entra depois, e só se o uso mostrar que compressão importa.

Consequência já conhecida: com limites altos (TJGO 12 MB, TRF1 20 MB) dividir basta. Em tribunais PJe com limites de 1,5 a 3 MB, um volume de 100 MB geraria dezenas de partes e a compressão deixaria de ser opcional. Por isso o primeiro perfil PJe é o do TRF1, onde a fase 1 realmente resolve o problema.

Se o módulo B usar um motor de licença AGPL (como o Ghostscript), a licença do projeto precisa ser reavaliada nesse momento.

## 10. Testes

Em GitHub Actions, a cada alteração:

1. Validação de todos os perfis contra o JSON Schema.
2. Propriedades do divisor, com PDFs sintéticos gerados no próprio teste: cada parte respeita o limite efetivo; a soma das páginas das partes é igual à do original; a ordem se mantém, conferida por marcadores no conteúdo de cada página.
3. Benchmark do portão técnico.

## 11. Repositório

- Nome: `doc-fracionado`, na conta `ragrezende`.
- Licença: MIT.
- Visibilidade: privado até haver algo que valha mostrar; público no lançamento.
- Interface e documentação em português do Brasil.

## 12. Verificações

Não são lacunas de design, mas fatos a confirmar na hora certa. O acompanhamento está em `docs/LANCAMENTO.md`.

- Licenças de `pdf-lib` e `pdf.js`: **verificadas em 2026-11-04** (`npm run check:licenses`; MIT e Apache-2.0).
- Se o TJGO publica página oficial com o limite do Projudi, para elevar a confiança do perfil: pendente.
- Se a Portaria Presi TRF1 8016281 sofreu alterações posteriores à cópia de 2019: pendente.
- Colisão do nome "Doc Fracionado" com outro projeto ou marca: pendente.
- Teste com um volume real do Projudi e no computador de 8 GB do autor: pendente (o portão técnico foi medido com PDFs sintéticos, em um container de 16 GB).
