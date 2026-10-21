import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { municipio } from "./municipio.ts";
import { auditColumns } from "./audit.ts";

/**
 * Associação/cooperativa atendida. Cadastro COMPARTILHADO entre projetos — a
 * participação em cada projeto (e a parceria da Meta 2) fica em `projeto_associacoes`.
 * O presidente e os demais contatos são usuários, ligados por `associacao_contatos`.
 */
export const associacao = pgTable(
  "associacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sigla: text("sigla").notNull(),
    nome: text("nome"),
    // Só dígitos; o dígito verificador é validado no zod
    cnpj: varchar("cnpj", { length: 14 }),
    municipioId: integer("municipio_id")
      .notNull()
      .references(() => municipio.id, { onDelete: "restrict" }),
    distrito: text("distrito"),
    endereco: text("endereco"),
    numProdutores: integer("num_produtores"),
    numFamilias: integer("num_familias"),
    areaMediaHa: numeric("area_media_ha", { precision: 10, scale: 2, mode: "number" }),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }),
    mapaUrl: text("mapa_url"),
    grupoWhatsappUrl: text("grupo_whatsapp_url"),
    dadosRevisados: boolean("dados_revisados").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    // "CISAN" e "CISAN ASPROPALMAS" convivem; a mesma sigla em municípios diferentes também
    uniqueIndex("associacoes_municipio_sigla_unico_idx")
      .on(t.municipioId, sql`lower(${t.sigla})`)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("associacoes_cnpj_unico_idx")
      .on(t.cnpj)
      .where(sql`${t.deletedAt} is null and ${t.cnpj} is not null`),
    index("associacoes_municipio_idx").on(t.municipioId),
    check("associacoes_num_produtores_ck", sql`${t.numProdutores} is null or ${t.numProdutores} >= 0`),
    check("associacoes_num_familias_ck", sql`${t.numFamilias} is null or ${t.numFamilias} >= 0`),
    check("associacoes_area_media_ck", sql`${t.areaMediaHa} is null or ${t.areaMediaHa} >= 0`),
    check("associacoes_coordenadas_ck", sql`num_nonnulls(${t.latitude}, ${t.longitude}) in (0, 2)`),
  ],
);

export type Associacao = typeof associacao.$inferSelect;
export type NewAssociacao = typeof associacao.$inferInsert;
