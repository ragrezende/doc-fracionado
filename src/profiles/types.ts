export type Confianca = 'oficial' | 'noticia_nao_oficial' | 'reportado_por_usuario';

export type Restricao =
  | { tipo: 'tamanho_maximo_arquivo'; bytes: number }
  | {
      tipo: 'media_maxima_por_pagina';
      quando_arquivo_entre_bytes?: [number, number];
      bytes_por_pagina: number;
    }
  | { tipo: 'max_arquivos_por_peticionamento'; quantidade: number }
  | { tipo: 'texto_pesquisavel'; nivel: 'aviso' };

export interface Perfil {
  id: string;
  tribunal: string;
  sistema: string;
  restricoes: Restricao[];
  confianca: Confianca;
  fonte: string;
  verificado_em: string;
  observacoes: string;
  lembretes: string[];
}
