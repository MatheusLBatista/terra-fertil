import { pgTable, uuid, text, integer, smallint, numeric, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { respostaDiagnosticoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Questionário da visita na propriedade (1:1 com a visita). Não há planilha de
 * origem — campos propostos no modelo de dados, a validar com o roteiro de campo.
 */
export const diagnosticoPropriedade = pgTable(
  "diagnosticos_propriedade",
  {
    visitaId: uuid("visita_id")
      .primaryKey()
      .references(() => visita.id, { onDelete: "cascade" }),
    areaProdutivaHa: numeric("area_produtiva_ha", { precision: 10, scale: 2, mode: "number" }),
    areaPastagemHa: numeric("area_pastagem_ha", { precision: 10, scale: 2, mode: "number" }),
    areaPreservadaHa: numeric("area_preservada_ha", { precision: 10, scale: 2, mode: "number" }),
    principaisCulturas: text("principais_culturas"),
    rebanhoBovino: integer("rebanho_bovino"),
    fonteAgua: text("fonte_agua"),
    possuiEnergia: boolean("possui_energia"),
    possuiIrrigacao: boolean("possui_irrigacao"),
    pessoasTrabalham: smallint("pessoas_trabalham"),
    analiseSoloRecente: respostaDiagnosticoEnum("analise_solo_recente"),
    acessoMaquinario: respostaDiagnosticoEnum("acesso_maquinario"),
    comentarios: text("comentarios"),
    ...auditColumns,
  },
  (t) => [
    check(
      "diagnosticos_propriedade_areas_ck",
      sql`coalesce(${t.areaProdutivaHa}, 0) >= 0 and coalesce(${t.areaPastagemHa}, 0) >= 0 and coalesce(${t.areaPreservadaHa}, 0) >= 0`,
    ),
    check(
      "diagnosticos_propriedade_contagens_ck",
      sql`coalesce(${t.rebanhoBovino}, 0) >= 0 and coalesce(${t.pessoasTrabalham}, 0) >= 0`,
    ),
  ],
);

export type DiagnosticoPropriedade = typeof diagnosticoPropriedade.$inferSelect;
export type NewDiagnosticoPropriedade = typeof diagnosticoPropriedade.$inferInsert;
