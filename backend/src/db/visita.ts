import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  numeric,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { associacao } from "./associacao.ts";
import { propriedade } from "./propriedade.ts";
import { user } from "./user.ts";
import { visitaTipoEnum, visitaSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Toda ida a campo. A visita inicial é na associação; as demais, na propriedade.
 * Conta para as metas do `projetoId`. O `id` pode ser gerado no app (offline).
 */
export const visita = pgTable(
  "visitas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    tipo: visitaTipoEnum("tipo").notNull(),
    situacao: visitaSituacaoEnum("situacao").notNull().default("agendada"),
    associacaoId: uuid("associacao_id").references(() => associacao.id, { onDelete: "restrict" }),
    propriedadeId: uuid("propriedade_id").references(() => propriedade.id, { onDelete: "restrict" }),
    // Acompanhamento → visita de origem
    visitaAnteriorId: uuid("visita_anterior_id").references((): AnyPgColumn => visita.id, {
      onDelete: "restrict",
    }),
    data: date("data").notNull(),
    realizadaEm: timestamp("realizada_em", { withTimezone: true }),
    tecnicoId: text("tecnico_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }),
    relato: text("relato"),
    noticiaUrl: text("noticia_url"),
    ...auditColumns,
  },
  (t) => [
    // Exatamente um alvo; a inicial é na associação, as demais na propriedade
    check("visitas_alvo_ck", sql`num_nonnulls(${t.associacaoId}, ${t.propriedadeId}) = 1`),
    check("visitas_tipo_alvo_ck", sql`(${t.tipo} = 'inicial_associacao') = (${t.associacaoId} is not null)`),
    check("visitas_realizada_ck", sql`(${t.situacao} = 'realizada') = (${t.realizadaEm} is not null)`),
    check("visitas_coordenadas_ck", sql`num_nonnulls(${t.latitude}, ${t.longitude}) in (0, 2)`),
    // Apuração de meta: where projeto_id = $1 and tipo = … (cobre também a FK de projeto)
    index("visitas_projeto_tipo_data_idx").on(t.projetoId, t.tipo, t.data),
    index("visitas_associacao_idx").on(t.associacaoId),
    index("visitas_propriedade_idx").on(t.propriedadeId),
    index("visitas_anterior_idx").on(t.visitaAnteriorId),
    index("visitas_tecnico_idx").on(t.tecnicoId),
  ],
);

export type Visita = typeof visita.$inferSelect;
export type NewVisita = typeof visita.$inferInsert;
