import { pgTable, uuid, text, smallint, index } from "drizzle-orm/pg-core";
import { meta } from "./meta.ts";
import { auditColumns } from "./audit.ts";

/** Entregável de uma meta (ex.: "Diagnóstico de pelo menos 100 associações"). */
export const indicador = pgTable(
  "indicadores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metaId: uuid("meta_id")
      .notNull()
      .references(() => meta.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    ordem: smallint("ordem").notNull().default(0),
    ...auditColumns,
  },
  (t) => [index("indicadores_meta_idx").on(t.metaId)],
);

export type Indicador = typeof indicador.$inferSelect;
export type NewIndicador = typeof indicador.$inferInsert;
