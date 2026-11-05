import { parsePerfil } from './parse';
import type { Perfil } from './types';

const arquivos = import.meta.glob('../../profiles/*.json', { eager: true, import: 'default' });

/** Carrega e valida todos os perfis de `profiles/`, ordenados por id. O schema é ignorado. */
export function carregarPerfis(): Perfil[] {
  return Object.entries(arquivos)
    .filter(([caminho]) => !caminho.endsWith('/schema.json'))
    .map(([, conteudo]) => parsePerfil(conteudo))
    .sort((a, b) => a.id.localeCompare(b.id));
}
