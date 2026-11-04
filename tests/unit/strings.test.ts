import { describe, expect, it } from 'vitest';
import { formatarData, formatarMB, mensagemDeErroDoWorker, rotuloDaConfianca } from '../../src/ui/strings';

describe('formatarMB', () => {
  it('usa vírgula decimal e MB binário, como o tribunal exibe', () => {
    expect(formatarMB(12_582_912)).toBe('12,0 MB');
    expect(formatarMB(1_572_864)).toBe('1,5 MB');
    expect(formatarMB(0)).toBe('0,0 MB');
  });
});

describe('formatarData', () => {
  it('converte AAAA-MM-DD para DD/MM/AAAA', () => {
    expect(formatarData('2026-11-02')).toBe('02/11/2026');
  });
});

describe('mensagemDeErroDoWorker', () => {
  it('nunca mostra "undefined": sem detalhe, orienta a recarregar a página', () => {
    const esperado = 'Não foi possível processar o arquivo. Recarregue a página e tente de novo.';
    expect(mensagemDeErroDoWorker(undefined)).toBe(esperado);
    expect(mensagemDeErroDoWorker('')).toBe(esperado);
    expect(mensagemDeErroDoWorker('   ')).toBe(esperado);
  });

  it('acrescenta o detalhe quando existe', () => {
    expect(mensagemDeErroDoWorker('falha ao carregar')).toBe('Não foi possível processar o arquivo. falha ao carregar');
  });
});

describe('rotuloDaConfianca', () => {
  it('traduz os três valores de confiança do perfil', () => {
    expect(rotuloDaConfianca('oficial')).toBe('Fonte oficial');
    expect(rotuloDaConfianca('noticia_nao_oficial')).toBe('Notícia, não oficial');
    expect(rotuloDaConfianca('reportado_por_usuario')).toBe('Informado por usuário');
  });
});
