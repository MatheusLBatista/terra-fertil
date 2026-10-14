import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { env } from "../lib/env.ts";
import * as schema from "./schema.ts";

const pkg = createRequire(import.meta.url)("../../package.json") as { name: string };

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // Query presa não segura uma conexão para sempre (0 no .env desliga)
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS || false,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Aparece em pg_stat_activity — identifica a API no servidor
  application_name: pkg.name,
});

export const db = drizzle(pool, { schema });

/**
 * Conexão ou transação. Os métodos de repository que participam de uma
 * transação recebem isto como último parâmetro (default `db`), para que o
 * service possa abrir a transação e manter a decisão de negócio na sua camada
 * sem que o repository precise conhecer regras.
 */
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Escapa `%`, `_` e `\` de um termo de busca para uso em `ilike` — sem isto
 * o usuário controla o padrão ("%" casa tudo). Use: `ilike(col, `%${escaparLike(termo)}%`)`.
 */
export function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Informa ao Postgres o usuário da requisição (GUC `app.user_id`, escopo da
 * transação) para a trigger de histórico registrar o autor de um DELETE FÍSICO
 * — num soft delete (o padrão do template) o autor já vem de `updated_by`.
 * Chame dentro de `db.transaction` antes do `delete`:
 *
 *   await db.transaction(async (tx) => {
 *     await comUsuarioNaSessao(tx, getCurrentUserId());
 *     await tx.delete(tabela).where(...);
 *   });
 */
export async function comUsuarioNaSessao(tx: DbOrTx, userId: string | null | undefined): Promise<void> {
  await tx.execute(sql`select set_config('app.user_id', ${userId ?? ""}, true)`);
}
