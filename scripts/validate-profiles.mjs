// Valida os perfis de profiles/*.json contra profiles/schema.json (roda só em Node/CI).
// O ajv gera código com `new Function`, que a CSP do site proíbe; por isso o navegador usa
// o validador manual de src/profiles/parse.ts e este script garante a paridade.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2019 from 'ajv/dist/2019.js';

const pastaPerfis = new URL('../profiles/', import.meta.url);
const schema = JSON.parse(readFileSync(new URL('schema.json', pastaPerfis), 'utf8'));
const validar = new Ajv2019({ allErrors: true }).compile(schema);

/** Devolve a lista de erros (vazia quando o perfil é válido). */
export function validarPerfilComSchema(perfil) {
  return validar(perfil) ? [] : (validar.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
}

function validarTodos() {
  let falhou = false;
  const arquivos = readdirSync(pastaPerfis).filter((f) => f.endsWith('.json') && f !== 'schema.json');
  for (const arquivo of arquivos) {
    const erros = validarPerfilComSchema(JSON.parse(readFileSync(new URL(arquivo, pastaPerfis), 'utf8')));
    if (erros.length > 0) {
      falhou = true;
      console.error(`✗ ${arquivo}\n  ${erros.join('\n  ')}`);
    } else {
      console.log(`✓ ${arquivo}`);
    }
  }
  if (arquivos.length === 0) {
    console.error('Nenhum perfil encontrado em profiles/.');
    falhou = true;
  }
  process.exit(falhou ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) validarTodos();
