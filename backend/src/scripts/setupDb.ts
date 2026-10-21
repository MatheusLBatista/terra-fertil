import { spawnSync } from "node:child_process";
import { env } from "../lib/env.ts";

/**
 * Prepara o banco de ponta a ponta, idempotente — serve tanto para o dev
 * (`db:reset` chama isto depois de dropar) quanto para o serviço one-shot
 * `migrate` do compose de deploy, que roda a cada deploy antes da API.
 *
 * 1. Schema: `drizzle-kit migrate` (default) aplica as migrations versionadas
 *    de drizzle/ (geradas com `bun run db:generate` após mudar um model).
 *    `DB_SCHEMA_MODE=push` no .env ou `--push` na linha de comando troca por
 *    `drizzle-kit push` (sincroniza direto do model, sem histórico — só para
 *    protótipo sem dados reais).
 * 2. Trigger de histórico em todas as tabelas auditáveis.
 * 3. Seeds (papéis/permissões, admin do .env, estados/municípios) — todos
 *    fazem "insere se não existe".
 */
const usarPush = process.argv.includes("--push") || env.DB_SCHEMA_MODE === "push";

function rodar(descricao: string, cmd: string, args: string[]) {
  console.log(`\n▶ ${descricao}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`✖ Falhou: ${descricao}`);
    process.exit(r.status ?? 1);
  }
}

if (usarPush) {
  rodar("Sincronizando schema (drizzle-kit push)", "bunx", ["drizzle-kit", "push", "--force"]);
} else {
  rodar("Aplicando migrations (drizzle-kit migrate)", "bunx", ["drizzle-kit", "migrate"]);
}
rodar("Trigger de histórico", "bunx", ["tsx", "src/scripts/applyTriggers.ts"]);
rodar("Seeds", "bunx", ["tsx", "src/seeds/index.ts"]);

console.log("\n✓ Banco pronto.");
