import { pgTable, uuid, text, boolean } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit.ts";

/**
 * Papéis (roles) do RBAC. O `nome` é a chave natural referenciada por
 * `user.role` (FK) — o better-auth continua gravando a string normalmente,
 * mas o banco garante que todo papel atribuído existe.
 *
 * `nome` tem unique TOTAL (não parcial): a FK exige. Consequência: para
 * "recriar" um papel soft-deletado com o mesmo nome, reative a linha antiga
 * (deletedAt = null) em vez de inserir outra.
 *
 * `acessoTodosProjetos` libera todos os projetos (admin e gestor no seed); sem
 * ela o usuário só enxerga os projetos em que está na equipe (src/lib/escopo.ts).
 */
export const papel = pgTable("papeis", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  descricao: text("descricao"),
  acessoTodosProjetos: boolean("acesso_todos_projetos").notNull().default(false),
  ...auditColumns,
});

export type Papel = typeof papel.$inferSelect;
export type NewPapel = typeof papel.$inferInsert;
