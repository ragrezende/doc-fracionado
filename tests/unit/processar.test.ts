import { describe, expect, it } from 'vitest';
import { parsePerfil } from '../../src/profiles/parse';
import type { Perfil } from '../../src/profiles/types';
import { LIMITE_SEGURO_BYTES, validarTamanho, type Resposta } from '../../src/worker/protocol';
import { processarArquivo } from '../../src/worker/processar';
import { encryptedMinimalPdf } from '../helpers/fixtures';
import { makeSyntheticPdf } from '../helpers/syntheticPdf';

const perfil: Perfil = parsePerfil({
  id: 'teste',
  tribunal: 'T',
  sistema: 'S',
  restricoes: [{ tipo: 'tamanho_maximo_arquivo', bytes: 3_000_000 }],
  confianca: 'oficial',
  fonte: 'teste',
  verificado_em: '2026-11-04',
  observacoes: '',
  lembretes: [],
});

async function coletar(bytes: Uint8Array, p: Perfil = perfil): Promise<Resposta[]> {
  const respostas: Resposta[] = [];
  await processarArquivo(bytes, p, 0.05, (r) => respostas.push(r));
  return respostas;
}

describe('validarTamanho', () => {
  it('aceita exatamente 300 MB', () => {
    expect(validarTamanho(300 * 1024 * 1024)).toEqual({ ok: true });
    expect(LIMITE_SEGURO_BYTES).toBe(300 * 1024 * 1024);
  });

  it('recusa 1 byte acima de 300 MB, com a mensagem em português', () => {
    expect(validarTamanho(300 * 1024 * 1024 + 1)).toEqual({
      ok: false,
      mensagem: 'Arquivo grande demais para processar com segurança neste navegador.',
    });
  });
});

describe('processarArquivo: caminho feliz', () => {
  it('emite o diagnóstico antes do resultado, e o resultado é uma divisão bem-sucedida', async () => {
    const respostas = await coletar(await makeSyntheticPdf({ pages: 10, bytesPerPage: 1_000_000 }));
    const tipos = respostas.map((r) => r.tipo);

    expect(tipos.indexOf('diagnostico')).toBeGreaterThanOrEqual(0);
    expect(tipos.indexOf('diagnostico')).toBeLessThan(tipos.indexOf('resultado'));
    expect(tipos.at(-1)).toBe('resultado');
    expect(tipos).not.toContain('erro');

    const resultado = respostas.find((r) => r.tipo === 'resultado');
    expect(resultado?.tipo === 'resultado' && resultado.resultado.ok).toBe(true);
  });

  it('emite progresso que nunca decresce dentro de cada etapa e nunca passa do total', async () => {
    const respostas = await coletar(await makeSyntheticPdf({ pages: 10, bytesPerPage: 1_000_000 }));
    const ultimo: Record<string, number> = {};

    for (const r of respostas) {
      if (r.tipo !== 'progresso') continue;
      expect(r.feito).toBeLessThanOrEqual(r.total);
      expect(r.feito).toBeGreaterThanOrEqual(ultimo[r.etapa] ?? 0);
      ultimo[r.etapa] = r.feito;
    }
    expect(Object.keys(ultimo).sort()).toEqual(['diagnostico', 'divisao']);
  });
});

describe('processarArquivo: erros viram Resposta, nunca exceção', () => {
  it("PDF protegido → erro 'protegido', e nenhum resultado", async () => {
    const respostas = await coletar(encryptedMinimalPdf());
    const erro = respostas.find((r) => r.tipo === 'erro');
    expect(erro?.tipo === 'erro' && erro.codigo).toBe('protegido');
    expect(respostas.map((r) => r.tipo)).not.toContain('resultado');
  });

  it("arquivo que não é PDF → erro 'invalido'", async () => {
    const erro = (await coletar(new TextEncoder().encode('isto nao e um pdf'))).find((r) => r.tipo === 'erro');
    expect(erro?.tipo === 'erro' && erro.codigo).toBe('invalido');
  });

  it("arquivo acima do limite seguro → erro 'grande_demais' sem tentar ler o PDF", async () => {
    const erro = (await coletar(new Uint8Array(LIMITE_SEGURO_BYTES + 1))).find((r) => r.tipo === 'erro');
    expect(erro).toEqual({
      tipo: 'erro',
      codigo: 'grande_demais',
      mensagem: 'Arquivo grande demais para processar com segurança neste navegador.',
    });
  });

  it("qualquer outra exceção → erro 'interno'", async () => {
    const semLimite = { ...perfil, restricoes: [] } as Perfil; // limiteEfetivoBytes lança
    const erro = (await coletar(await makeSyntheticPdf({ pages: 2, bytesPerPage: 1_000 }), semLimite)).find(
      (r) => r.tipo === 'erro',
    );
    expect(erro?.tipo === 'erro' && erro.codigo).toBe('interno');
  });
});
