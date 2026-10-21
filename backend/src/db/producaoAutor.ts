import { pgTable, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { producao } from "./producao.ts";
import { projetoEquipe } from "./projetoEquipe.ts";
import { auditColumns } from "./audit.ts";

/** Autoria da produção — membro da equipe do mesmo projeto (o service garante). */
export const producaoAutor = pgTable(
  "producao_autores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    producaoId: uuid("producao_id")
      .notNull()
      .references(() => producao.id, { onDelete: "cascade" }),
    projetoEquipeId: uuid("projeto_equipe_id")
      .notNull()
      .references(() => projetoEquipe.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("producao_autores_unico_idx")
      .on(t.producaoId, t.projetoEquipeId)
      .where(sql`${t.deletedAt} is null`),
    index("producao_autores_producao_idx").on(t.producaoId),
    index("producao_autores_equipe_idx").on(t.projetoEquipeId),
  ],
);

export type ProducaoAutor = typeof producaoAutor.$inferSelect;
export type NewProducaoAutor = typeof producaoAutor.$inferInsert;
