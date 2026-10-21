import { pgTable, uuid, text, bigint, boolean, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { itemTipoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/** Catálogo global de máquinas, implementos e insumos — reaproveitado entre projetos. */
export const item = pgTable(
  "itens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    descricao: text("descricao").notNull(),
    tipo: itemTipoEnum("tipo").notNull(),
    unidade: text("unidade").notNull().default("un"),
    valorReferenciaCentavos: bigint("valor_referencia_centavos", { mode: "number" }),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("itens_descricao_unico_idx")
      .on(sql`lower(${t.descricao})`)
      .where(sql`${t.deletedAt} is null`),
    check(
      "itens_valor_nao_negativo",
      sql`${t.valorReferenciaCentavos} is null or ${t.valorReferenciaCentavos} >= 0`,
    ),
  ],
);

export type Item = typeof item.$inferSelect;
export type NewItem = typeof item.$inferInsert;
