import { pool } from "../db/index.ts";
import { env } from "../lib/env.ts";

/**
 * Dropa TUDO (schema public inteiro, incluindo enums e triggers) e recria o
 * schema vazio. Também derruba o schema `drizzle` (tabela de controle das
 * migrations) — senão um `db:migrate` posterior acharia que tudo já foi
 * aplicado. É o primeiro passo do `bun run db:reset`.
 *
 * Recusa rodar em produção.
 */
async function main() {
  if (env.NODE_ENV === "production") {
    console.error("✖ db:reset é destrutivo e não roda com NODE_ENV=production.");
    process.exit(1);
  }

  console.log("Dropando schemas public e drizzle...");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  console.log("✓ Schema recriado vazio. Próximo passo: db:setup (schema + triggers + seeds).");
  await pool.end();
}

main().catch((err) => {
  console.error("✖ Falha no reset:", err);
  process.exit(1);
});
