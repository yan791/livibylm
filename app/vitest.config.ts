/*
  Testes do Worker e do banco ("npm test"). Rodam dentro do runtime da Cloudflare
  (workerd), com um D1 e um R2 locais; cada teste começa com o banco vazio e as
  migrations de migrations/ aplicadas.
*/
import { join } from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(join(import.meta.dirname, 'migrations'))
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SENHA_PEPPER: 'pepper-so-dos-testes-com-mais-de-32-caracteres',
            // compras com as vendas desligadas, só em localhost (como no "npm run api")
            TESTE_VENDAS: 'sim',
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/preparar.ts'],
    },
  }
})
