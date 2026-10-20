/*
  Gera um link de acesso ao painel direto pelo terminal (para o primeiro
  acesso, quando ainda não há ninguém para convidar pelo próprio painel).
  A pessoa abre o link e cria a própria senha; o link vale 7 dias.

    npm run convite -- email@exemplo.com "Nome"                      banco local (testes)
    npm run convite -- email@exemplo.com "Nome" --remoto https://...  banco publicado + endereço do site
*/
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const iRemoto = args.indexOf('--remoto')
const remoto = iRemoto >= 0
const site = remoto ? args[iRemoto + 1] : 'http://localhost:5200'
const [email, nome = ''] = remoto ? args.filter((_, i) => i !== iRemoto && i !== iRemoto + 1) : args

if (!email || !/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email) || /'/.test(nome) || (remoto && !/^https:\/\//.test(site ?? ''))) {
  console.error('Uso: npm run convite -- email@exemplo.com "Nome" [--remoto https://endereco-do-site]')
  process.exit(1)
}

const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const expira = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
const e = email.toLowerCase()

const sql = [
  `INSERT INTO admins (email, nome) VALUES ('${e}', '${nome}') ON CONFLICT (email) DO NOTHING;`,
  `DELETE FROM convites WHERE admin_id = (SELECT id FROM admins WHERE email = '${e}');`,
  `INSERT INTO convites (token_hash, admin_id, expira_em) VALUES ('${hash}', (SELECT id FROM admins WHERE email = '${e}'), ${expira});`,
].join(' ')

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
const r = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'livi', remoto ? '--remote' : '--local', '--command', sql], {
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf8',
})
if (r.status !== 0) {
  console.error(r.stdout)
  process.exit(r.status ?? 1)
}

console.log(`\nLink de acesso para ${e} (vale 7 dias, uso único):\n${site.replace(/\/$/, '')}/painel/convite/${token}\n`)
