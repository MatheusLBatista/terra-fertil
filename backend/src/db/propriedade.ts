import { pgTable, uuid, text, varchar, integer, numeric, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { produtor } from "./produtor.ts";
import { associacao } from "./associacao.ts";
import { municipio } from "./municipio.ts";
import { auditColumns } from "./audit.ts";

/**
 * Unidade produtiva visitada. `associacaoId` é a associação que a atende no
 * projeto — é por ela que a propriedade entra no escopo de acesso.
 */
export const propriedade = pgTable(
  "propriedades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    produtorId: uuid("produtor_id")
      .notNull()
      .references(() => produtor.id, { onDelete: "restrict" }),
    associacaoId: uuid("associacao_id")
      .notNull()
      .references(() => associacao.id, { onDelete: "restrict" }),
    nome: text("nome"),
    municipioId: integer("municipio_id")
      .notNull()
      .references(() => municipio.id, { onDelete: "restrict" }),
    distrito: text("distrito"),
    endereco: text("endereco"),
    areaTotalHa: numeric("area_total_ha", { precision: 10, scale: 2, mode: "number" }),
    areaProdutivaHa: numeric("area_produtiva_ha", { precision: 10, scale: 2, mode: "number" }),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }),
    // Cadastro Ambiental Rural
    car: varchar("car", { length: 60 }),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    index("propriedades_produtor_idx").on(t.produtorId),
    index("propriedades_associacao_idx").on(t.associacaoId),
    index("propriedades_municipio_idx").on(t.municipioId),
    check("propriedades_area_total_ck", sql`${t.areaTotalHa} is null or ${t.areaTotalHa} >= 0`),
    check(
      "propriedades_area_produtiva_ck",
      sql`${t.areaProdutivaHa} is null or (${t.areaProdutivaHa} >= 0 and (${t.areaTotalHa} is null or ${t.areaProdutivaHa} <= ${t.areaTotalHa}))`,
    ),
    check("propriedades_coordenadas_ck", sql`num_nonnulls(${t.latitude}, ${t.longitude}) in (0, 2)`),
  ],
);

export type Propriedade = typeof propriedade.$inferSelect;
export type NewPropriedade = typeof propriedade.$inferInsert;
