/**
 * Cria um worker de módulo a partir de um `blob:` que apenas importa o script de verdade.
 *
 * Por quê: a CSP do site vem de um `<meta>`, e um worker criado de uma URL `http(s)` recebe a política
 * dos cabeçalhos da PRÓPRIA resposta que o serve. O GitHub Pages não envia CSP, então esse worker
 * ficaria sem nenhuma restrição de rede, justamente o contexto que segura os bytes do PDF. Um worker
 * criado de um `blob:` herda a política do documento que o criou (e os que ele criar herdam dele),
 * então `connect-src 'none'` vale também lá dentro. Exige `worker-src 'self' blob:`.
 *
 * `urlAbsolutaDoModulo` precisa ser absoluta: dentro de um worker `blob:` não há base para resolver
 * URLs relativas.
 */
export function criarWorkerSeguro(urlAbsolutaDoModulo: string): Worker {
  const origem = new URL(urlAbsolutaDoModulo).href; // lança se a URL não for absoluta
  const url = URL.createObjectURL(new Blob([`import ${JSON.stringify(origem)};`], { type: 'text/javascript' }));
  setTimeout(() => URL.revokeObjectURL(url), 30_000); // o worker já carregou muito antes disso
  return new Worker(url, { type: 'module' });
}
