import { pgTable, uuid, text, boolean, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { associacao } from "./associacao.ts";
import { user } from "./user.ts";
import { contatoFuncaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Vínculo usuário ↔ associação (presidente, contato principal, demais contatos).
 * Nome, e-mail e telefone moram no `user` — uma pessoa que é produtora e presidente
 * é um único usuário com um perfil em `produtores` e uma linha aqui.
 */
export const associacaoContato = pgTable(
  "associacao_contatos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associacaoId: uuid("associacao_id")
      .notNull()
      .references(() => associacao.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    funcao: contatoFuncaoEnum("funcao").notNull().default("contato"),
    principal: boolean("principal").notNull().default(false),
    desde: date("desde"),
    ate: date("ate"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("associacao_contatos_associacao_user_unico_idx")
      .on(t.associacaoId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    // Um contato principal por associação
    uniqueIndex("associacao_contatos_principal_unico_idx")
      .on(t.associacaoId)
      .where(sql`${t.principal} and ${t.deletedAt} is null`),
    index("associacao_contatos_associacao_idx").on(t.associacaoId),
    index("associacao_contatos_user_idx").on(t.userId),
  ],
);

export type AssociacaoContato = typeof associacaoContato.$inferSelect;
export type NewAssociacaoContato = typeof associacaoContato.$inferInsert;
