import { pgTable, uuid, text, integer, numeric, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { opcaoDiagnostico } from "./opcaoDiagnostico.ts";
import { associacao } from "./associacao.ts";
import { municipio } from "./municipio.ts";
import { eventoTipoEnum, eventoSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/** Evento formativo do projeto (Meta 6): curso, oficina, dia de campo… */
export const evento = pgTable(
  "eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    titulo: text("titulo").notNull(),
    tipo: eventoTipoEnum("tipo").notNull(),
    // Opção do grupo `tema_capacitacao`
    temaId: uuid("tema_id").references(() => opcaoDiagnostico.id, { onDelete: "restrict" }),
    // Comunidade anfitriã
    associacaoId: uuid("associacao_id").references(() => associacao.id, { onDelete: "restrict" }),
    municipioId: integer("municipio_id")
      .notNull()
      .references(() => municipio.id, { onDelete: "restrict" }),
    local: text("local"),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fim: timestamp("fim", { withTimezone: true }).notNull(),
    cargaHoraria: numeric("carga_horaria", { precision: 5, scale: 1, mode: "number" }),
    instrutor: text("instrutor"),
    situacao: eventoSituacaoEnum("situacao").notNull().default("planejado"),
    relato: text("relato"),
    ...auditColumns,
  },
  (t) => [
    check("eventos_periodo_ck", sql`${t.fim} >= ${t.inicio}`),
    check("eventos_carga_horaria_ck", sql`${t.cargaHoraria} is null or ${t.cargaHoraria} > 0`),
    index("eventos_projeto_inicio_idx").on(t.projetoId, t.inicio),
    index("eventos_tema_idx").on(t.temaId),
    index("eventos_associacao_idx").on(t.associacaoId),
    index("eventos_municipio_idx").on(t.municipioId),
  ],
);

export type Evento = typeof evento.$inferSelect;
export type NewEvento = typeof evento.$inferInsert;
