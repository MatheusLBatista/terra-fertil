import { pgTable, uuid, text, date, index } from "drizzle-orm/pg-core";
import { propriedade } from "./propriedade.ts";
import { visita } from "./visita.ts";
import { recomendacaoCategoriaEnum, recomendacaoSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Orientação técnica dada numa visita de assistência; a visita de acompanhamento
 * verifica a adoção. Herda o projeto da visita (sem coluna própria).
 */
export const recomendacao = pgTable(
  "recomendacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propriedadeId: uuid("propriedade_id")
      .notNull()
      .references(() => propriedade.id, { onDelete: "restrict" }),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visita.id, { onDelete: "cascade" }),
    categoria: recomendacaoCategoriaEnum("categoria").notNull(),
    cultura: text("cultura"),
    descricao: text("descricao").notNull(),
    prazo: date("prazo"),
    situacao: recomendacaoSituacaoEnum("situacao").notNull().default("pendente"),
    verificadaEmVisitaId: uuid("verificada_em_visita_id").references(() => visita.id, {
      onDelete: "set null",
    }),
    ...auditColumns,
  },
  (t) => [
    index("recomendacoes_propriedade_idx").on(t.propriedadeId),
    index("recomendacoes_visita_idx").on(t.visitaId),
    index("recomendacoes_verificada_idx").on(t.verificadaEmVisitaId),
  ],
);

export type Recomendacao = typeof recomendacao.$inferSelect;
export type NewRecomendacao = typeof recomendacao.$inferInsert;
