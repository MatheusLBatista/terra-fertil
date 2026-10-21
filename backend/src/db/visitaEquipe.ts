import { pgTable, uuid, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { user } from "./user.ts";
import { auditColumns } from "./audit.ts";

/** Outros técnicos/estudantes que foram à visita (além do responsável). */
export const visitaEquipe = pgTable(
  "visita_equipe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visita.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("visita_equipe_unico_idx")
      .on(t.visitaId, t.userId)
      .where(sql`${t.deletedAt} is null`),
    index("visita_equipe_visita_idx").on(t.visitaId),
    index("visita_equipe_user_idx").on(t.userId),
  ],
);

export type VisitaEquipe = typeof visitaEquipe.$inferSelect;
export type NewVisitaEquipe = typeof visitaEquipe.$inferInsert;
