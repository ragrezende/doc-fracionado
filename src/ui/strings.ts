import type { Confianca } from '../profiles/types';

/** Tamanho em MB binário (1 MB = 1.048.576 bytes), como os sistemas de tribunal exibem. */
export function formatarMB(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Mensagem para quando o worker falha. O evento de erro de um worker que nem chegou a carregar
 * (por exemplo, sem rede) vem com `message` vazia, o que antes aparecia na tela como "undefined".
 */
export function mensagemDeErroDoWorker(detalhe: string | undefined): string {
  const texto = detalhe?.trim();
  return texto ? `${T.erroLeitura} ${texto}` : `${T.erroLeitura} Recarregue a página e tente de novo.`;
}

/**
 * Mensagem para uma página que sozinha não cumpre o perfil. Distingue os dois motivos: maior que o
 * limite do arquivo, ou menor que ele mas acima da média por página que o perfil exige. Dizer "não
 * cabe no limite" para uma página de 5 MB num limite de 12 MB seria falso e confundiria o usuário.
 */
export function mensagemPaginaPesada(
  pagina: number,
  bytesDaPagina: number,
  limiteEfetivo: number,
  nomeDoPerfil: string,
): string {
  const tamanho = formatarMB(bytesDaPagina);
  const orientacao = 'Esta versão não comprime PDFs: reduza ou digitalize novamente essa página.';
  return bytesDaPagina > limiteEfetivo
    ? `A página ${pagina} tem ${tamanho} e, sozinha, não cabe no limite do perfil. ${orientacao}`
    : `A página ${pagina} tem ${tamanho}. Isso cabe no limite de tamanho do arquivo, mas ultrapassa a média máxima por página que o perfil ${nomeDoPerfil} exige, e nenhuma divisão das páginas vizinhas resolve. ${orientacao}`;
}

export function rotuloDaConfianca(c: Confianca): string {
  return {
    oficial: 'Fonte oficial',
    noticia_nao_oficial: 'Notícia, não oficial',
    reportado_por_usuario: 'Informado por usuário',
  }[c];
}

export const T = {
  titulo: 'Doc Fracionado',
  subtitulo: 'Divide PDFs para o peticionamento eletrônico, direto no seu navegador.',
  privacidade:
    'Seus arquivos não saem do computador. Tudo é processado aqui, no navegador, sem enviar nada a servidor algum.',
  semJavascript: 'Esta ferramenta precisa de JavaScript para funcionar.',
  rotuloPerfil: 'Perfil do tribunal',
  rotuloArquivo: 'Arquivo PDF',
  tituloPerfil: 'Sobre este perfil',
  desatualizado: 'Este perfil foi verificado há mais de 180 dias e pode estar desatualizado.',
  fonte: 'Fonte',
  lendo: 'Lendo e analisando o PDF…',
  dividindo: (feito: number, total: number) => `Dividindo… ${feito} de ${total} páginas`,
  resultado: 'Resultado',
  arquivo: 'Arquivo',
  diagnostico: 'Diagnóstico',
  paginas: 'Páginas',
  tamanho: 'Tamanho',
  textoPesquisavel: 'Texto pesquisável',
  assinaturaDigital: 'Assinatura digital',
  maisPesadas: 'Páginas mais pesadas (estimativa)',
  sim: 'Sim',
  nao: 'Não',
  parcial: (comTexto: number, total: number) => `Parcial (${comTexto} de ${total} páginas)`,
  jaCumpre: (perfil: string) => `Este arquivo já cumpre o perfil ${perfil} e não precisa ser dividido.`,
  dividido: (n: number) => (n === 1 ? 'O arquivo gerou 1 parte.' : `O arquivo foi dividido em ${n} partes.`),
  partes: 'Partes geradas',
  colArquivo: 'Arquivo',
  colPaginas: 'Páginas',
  colTamanho: 'Tamanho',
  colSituacao: 'Situação',
  cumpre: 'Cumpre',
  naoCumpre: 'Não cumpre',
  avisos: 'Avisos',
  lembretes: 'Lembretes',
  baixarZip: 'Baixar ZIP',
  baixarOriginal: 'Baixar o PDF original',
  erroLeitura: 'Não foi possível processar o arquivo.',
} as const;
