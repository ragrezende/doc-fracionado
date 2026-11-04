// Falha se alguma dependência de produção tiver licença fora da lista permitida.
// `npm ls --parseable` dá o caminho de cada pacote; a licença vem do package.json dele.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Só licenças permissivas. Zlib e 0BSD entram porque `pako` e `tslib` (dependências transitivas
// do pdf-lib) as usam; nenhuma exige abrir o código de quem as usa.
const PERMITIDAS = (process.env.LICENCAS_PERMITIDAS ?? 'MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC,Zlib,0BSD')
  .split(',')
  .map((l) => l.trim());

function listarCaminhos() {
  let saida;
  try {
    saida = execSync('npm ls --omit=dev --all --parseable', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (erro) {
    // `npm ls` sai com código ≠ 0 em problemas de árvore (ex.: peer ausente), mas ainda lista os pacotes.
    saida = erro.stdout ?? '';
  }
  return [...new Set(saida.split('\n').map((l) => l.trim()).filter(Boolean))];
}

function licencaDe(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'DESCONHECIDA';
}

function permitida(expressao) {
  const limpa = expressao.replace(/[()]/g, '').trim();
  if (limpa.includes(' OR ')) return limpa.split(' OR ').some((l) => PERMITIDAS.includes(l.trim()));
  return limpa.split(' AND ').every((l) => PERMITIDAS.includes(l.trim()));
}

const caminhos = listarCaminhos();
const reprovados = [];
for (const caminho of caminhos) {
  const pkg = JSON.parse(readFileSync(join(caminho, 'package.json'), 'utf8'));
  const licenca = licencaDe(pkg);
  const ok = permitida(licenca);
  console.log(`${ok ? '✓' : '✗'} ${pkg.name}@${pkg.version}  ${licenca}`);
  if (!ok) reprovados.push(`${pkg.name}@${pkg.version} (${licenca})`);
}

if (caminhos.length === 0) {
  console.error('Nenhuma dependência de produção encontrada: algo está errado com `npm ls`.');
  process.exit(1);
}
if (reprovados.length > 0) {
  console.error(`\nLicenças fora da lista permitida (${PERMITIDAS.join(', ')}):\n  ${reprovados.join('\n  ')}`);
  process.exit(1);
}
console.log(`\n${caminhos.length} pacotes de produção, todos com licença permitida.`);
