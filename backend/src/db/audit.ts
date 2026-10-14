import { text, timestamp } from "drizzle-orm/pg-core";
import { getCurrentUserId } from "../lib/requestContext.ts";

/**
 * Colunas de auditoria compartilhadas por todos os models de domínio.
 *
 * - `createdAt`  → data/hora de criação; default no banco (`now()`).
 * - `updatedAt`  → data/hora da última atualização; atualizada automaticamente.
 * - `createdBy`  → preenchido automaticamente na inserção com o usuário autenticado.
 * - `updatedBy`  → preenchido automaticamente em cada atualização.
 * - `deletedAt`  → soft delete; quando preenchido, o registro é considerado excluído
 *                  e deve ser omitido das listagens (`isNull(tabela.deletedAt)`).
 *
 * Os valores de usuário são obtidos do contexto da requisição (AsyncLocalStorage),
 * populado pelo middleware `requireAuth`. Fora de uma requisição (ex.: seeds) ficam nulos.
 *
 * A presença de `deleted_at` também é o critério de auto-descoberta da trigger
 * de histórico (src/db/triggers/historico.sql) — todo model com `...auditColumns`
 * é auditado após `npm run db:triggers`.
 */
// A coluna é nullable; quando não há usuário no contexto (ex.: seeds) o valor
// resolve para null. O cast mantém a assinatura de `$defaultFn`/`$onUpdate`,
// que espera o tipo da coluna (string).
const currentUserId = (): string => getCurrentUserId() as string;

export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdBy: text("created_by").$defaultFn(currentUserId),
  updatedBy: text("updated_by").$defaultFn(currentUserId).$onUpdate(currentUserId),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
