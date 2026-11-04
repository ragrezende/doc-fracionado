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
  paginaPesada: (pagina: number, tamanho: string) =>
    `A página ${pagina} tem ${tamanho} e, sozinha, não cabe no limite do perfil. Esta versão não comprime PDFs: reduza ou digitalize novamente essa página.`,
  erroLeitura: 'Não foi possível processar o arquivo.',
} as const;
