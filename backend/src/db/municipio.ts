import { pgTable, integer, text, index } from "drizzle-orm/pg-core";
import { estado } from "./estado.ts";
import { auditColumns } from "./audit.ts";

/** PK = código IBGE do município (7 dígitos, ex.: 3550308 = São Paulo). */
export const municipio = pgTable(
  "municipios",
  {
    id: integer("id").primaryKey(),
    nome: text("nome").notNull(),
    estadoId: integer("estado_id")
      .notNull()
      .references(() => estado.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (t) => [index("municipios_estado_idx").on(t.estadoId)],
);

export type Municipio = typeof municipio.$inferSelect;
export type NewMunicipio = typeof municipio.$inferInsert;
