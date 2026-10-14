import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../db/index.ts";

/**
 * Aplica (cria/recria) a trigger de histórico de alterações no PostgreSQL.
 * Executa o SQL em `src/db/triggers/historico.sql` — a trigger se auto-aplica
 * em toda tabela com a coluna `deleted_at`.
 *
 * Uso: npm run db:triggers
 */
async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sqlText = readFileSync(join(__dirname, "..", "db", "triggers", "historico.sql"), "utf8");

  console.log("Aplicando trigger de histórico de alterações...");
  await pool.query(sqlText);
  console.log("✓ Trigger 'trg_historico' criada/atualizada em todas as tabelas auditadas.");
  await pool.end();
}

main().catch((err) => {
  console.error("✖ Falha ao aplicar triggers:", err);
  process.exit(1);
});
