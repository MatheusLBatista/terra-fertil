import { pgTable, uuid, text, date, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { user } from "./user.ts";
import { equipeTipoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Atuação de uma pessoa (user) num projeto. É também a base do ESCOPO de acesso:
 * quem não tem `papeis.acesso_todos_projetos` só enxerga os projetos em que tem
 * uma linha ativa aqui (src/lib/escopo.ts).
 */
export const projetoEquipe = pgTable(
  "projeto_equipe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    tipo: equipeTipoEnum("tipo").notNull(),
    funcao: text("funcao"),
    instituicao: text("instituicao"),
    curso: text("curso"),
    contratadoEm: date("contratado_em"),
    desligadoEm: date("desligado_em"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("projeto_equipe_projeto_user_unico_idx")
      .on(t.projetoId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index("projeto_equipe_projeto_idx").on(t.projetoId),
    index("projeto_equipe_user_idx").on(t.userId),
    check(
      "projeto_equipe_periodo_ck",
      sql`${t.desligadoEm} is null or ${t.contratadoEm} is null or ${t.desligadoEm} >= ${t.contratadoEm}`,
    ),
  ],
);

export type ProjetoEquipe = typeof projetoEquipe.$inferSelect;
export type NewProjetoEquipe = typeof projetoEquipe.$inferInsert;
