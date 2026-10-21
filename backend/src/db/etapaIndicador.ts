import { pgTable, uuid, text, integer, smallint, numeric, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { indicador } from "./indicador.ts";
import { apuracaoTipoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Etapa de um indicador, com previsto e peso (as colunas de cada aba M* da planilha).
 * `automatica`: o service resolve a `chave` numa consulta da ALLOWLIST
 * (src/modules/metas/apuracao.ts) — nunca SQL vindo do banco. `manual`: vale
 * `quantidadeManual`, digitada no painel.
 * % da etapa = executado ÷ previsto × peso (limitado a 100% do peso no cálculo).
 */
export const etapaIndicador = pgTable(
  "etapas_indicador",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indicadorId: uuid("indicador_id")
      .notNull()
      .references(() => indicador.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    quantidadePrevista: integer("quantidade_prevista").notNull(),
    peso: numeric("peso", { precision: 5, scale: 2, mode: "number" }).notNull(),
    apuracao: apuracaoTipoEnum("apuracao").notNull(),
    chave: text("chave"),
    quantidadeManual: integer("quantidade_manual"),
    ordem: smallint("ordem").notNull().default(0),
    ...auditColumns,
  },
  (t) => [
    check("etapas_indicador_apuracao_ck", sql`(${t.apuracao} = 'automatica') = (${t.chave} is not null)`),
    check("etapas_indicador_prevista_ck", sql`${t.quantidadePrevista} > 0`),
    check("etapas_indicador_peso_ck", sql`${t.peso} >= 0 and ${t.peso} <= 100`),
    check("etapas_indicador_manual_ck", sql`${t.quantidadeManual} is null or ${t.quantidadeManual} >= 0`),
    index("etapas_indicador_indicador_idx").on(t.indicadorId),
  ],
);

export type EtapaIndicador = typeof etapaIndicador.$inferSelect;
export type NewEtapaIndicador = typeof etapaIndicador.$inferInsert;
