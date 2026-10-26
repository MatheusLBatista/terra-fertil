import { pgTable, uuid, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { entrega } from "./entrega.ts";
import { auditColumns } from "./audit.ts";

/**
 * Item fornecido (entrega) conferido numa visita de acompanhamento na associação.
 * As fotos ficam em `visita_anexos` com o mesmo `entrega_id`.
 */
export const visitaItemVerificado = pgTable(
  "visita_itens_verificados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visita.id, { onDelete: "cascade" }),
    entregaId: uuid("entrega_id")
      .notNull()
      .references(() => entrega.id, { onDelete: "restrict" }),
    observacao: text("observacao"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("visita_itens_verificados_unico_idx")
      .on(t.visitaId, t.entregaId)
      .where(sql`${t.deletedAt} is null`),
    index("visita_itens_verificados_visita_idx").on(t.visitaId),
    index("visita_itens_verificados_entrega_idx").on(t.entregaId),
  ],
);

export type VisitaItemVerificado = typeof visitaItemVerificado.$inferSelect;
export type NewVisitaItemVerificado = typeof visitaItemVerificado.$inferInsert;
