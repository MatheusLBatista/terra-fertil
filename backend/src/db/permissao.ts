import { pgTable, uuid, text, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { papel } from "./papel.ts";
import { acaoPermissaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Permissões de um papel: par (ação, subject) do CASL.
 * `subject` é o nome registrado pelo módulo (ex.: "HistoricoAlteracao") ou
 * "all"; `acao` "manage" significa todas as ações sobre o subject.
 */
export const permissao = pgTable(
  "permissoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    papelId: uuid("papel_id")
      .notNull()
      .references(() => papel.id, { onDelete: "cascade" }),
    acao: acaoPermissaoEnum("acao").notNull(),
    subject: text("subject").notNull(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("permissoes_papel_acao_subject_idx")
      .on(t.papelId, t.acao, t.subject)
      .where(sql`${t.deletedAt} is null`),
    index("permissoes_papel_idx").on(t.papelId),
  ],
);

export type Permissao = typeof permissao.$inferSelect;
export type NewPermissao = typeof permissao.$inferInsert;
