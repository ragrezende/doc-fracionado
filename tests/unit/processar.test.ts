import { describe, expect, it } from 'vitest';
import { parsePerfil } from '../../src/profiles/parse';
import type { Perfil } from '../../src/profiles/types';
import { LIMITE_SEGURO_BYTES, validarTamanho, type Pedido, type Resposta } from '../../src/worker/protocol';
import { processarArquivo, processarPedido } from '../../src/worker/processar';
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

describe('processarPedido: o worker lê o arquivo, não a thread principal', () => {
  async function pedidoCom(arquivo: Pedido['arquivo']): Promise<Resposta[]> {
    const respostas: Resposta[] = [];
    await processarPedido({ tipo: 'processar', arquivo, perfil, margem: 0.05 }, (r) => respostas.push(r));
    return respostas;
  }

  it('aceita o PDF já lido (ArrayBuffer)', async () => {
    const pdf = await makeSyntheticPdf({ pages: 4, bytesPerPage: 1_000_000 });
    const respostas = await pedidoCom(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer);
    expect(respostas.at(-1)?.tipo).toBe('resultado');
  });

  it('lê um File uma única vez, dentro do processamento', async () => {
    const pdf = await makeSyntheticPdf({ pages: 4, bytesPerPage: 1_000_000 });
    const arquivo = new File([new Uint8Array(pdf)], 'volume.pdf', { type: 'application/pdf' });
    let leituras = 0;
    const lerUmaVez = {
      size: arquivo.size,
      arrayBuffer: () => (leituras++, arquivo.arrayBuffer()),
    };
    const respostas = await pedidoCom(lerUmaVez);
    expect(leituras).toBe(1);
    expect(respostas.at(-1)?.tipo).toBe('resultado');
  });

  it('recusa arquivo grande demais pelo tamanho, sem ler nenhum byte', async () => {
    const naoDeveLer = {
      size: LIMITE_SEGURO_BYTES + 1,
      arrayBuffer: () => Promise.reject(new Error('não deveria ter lido o arquivo')),
    };
    expect(await pedidoCom(naoDeveLer)).toEqual([
      {
        tipo: 'erro',
        codigo: 'grande_demais',
        mensagem: 'Arquivo grande demais para processar com segurança neste navegador.',
      },
    ]);
  });

  it("falha na leitura do arquivo → erro 'interno', sem lançar", async () => {
    const quebrado = { size: 10, arrayBuffer: () => Promise.reject(new Error('disco desconectado')) };
    const erro = (await pedidoCom(quebrado)).find((r) => r.tipo === 'erro');
    expect(erro?.tipo === 'erro' && erro.codigo).toBe('interno');
    expect(erro?.tipo === 'erro' && erro.mensagem).toMatch(/disco desconectado/);
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
