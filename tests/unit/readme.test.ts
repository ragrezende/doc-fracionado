import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { carregarPerfis } from '../../src/profiles/load';
import { formatarData, rotuloDaConfianca } from '../../src/ui/strings';

const readme = () => readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

describe('README: a tabela de perfis não diverge dos perfis reais', () => {
  for (const perfil of carregarPerfis()) {
    it(`${perfil.id}: nome, confiança e data de verificação aparecem no README`, () => {
      const texto = readme();
      expect(texto).toContain(`${perfil.tribunal} · ${perfil.sistema}`);
      expect(texto).toContain(rotuloDaConfianca(perfil.confianca));
      expect(texto).toContain(formatarData(perfil.verificado_em));
    });
  }
});

describe('README: avisos que não podem faltar', () => {
  it('diz que não há garantia de aceite pelo tribunal', () => {
    expect(readme()).toMatch(/não (oferece|há|dá) garantia/i);
  });

  it('lista as limitações conhecidas (links, assinatura digital, OCR, compressão)', () => {
    const texto = readme();
    expect(texto).toMatch(/links e marcadores/i);
    expect(texto).toMatch(/assinatura digital/i);
    expect(texto).toMatch(/OCR/);
    expect(texto).toMatch(/compress/i);
  });

  it('explica como conferir a privacidade', () => {
    expect(readme()).toMatch(/aba (de )?rede/i);
  });
});
