import { pgTable, uuid, text, date, index } from "drizzle-orm/pg-core";
import { projeto } from "./projeto.ts";
import { meta } from "./meta.ts";
import { producaoTipoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/** Relatórios e publicações do projeto que contam para as metas (M1, M7, M8). */
export const producao = pgTable(
  "producoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    titulo: text("titulo").notNull(),
    tipo: producaoTipoEnum("tipo").notNull(),
    metaId: uuid("meta_id").references(() => meta.id, { onDelete: "restrict" }),
    // Preenchida = concluída (é o que conta para a meta)
    concluidaEm: date("concluida_em"),
    arquivoKey: text("arquivo_key"),
    url: text("url"),
    resumo: text("resumo"),
    ...auditColumns,
  },
  (t) => [
    index("producoes_projeto_tipo_idx").on(t.projetoId, t.tipo),
    index("producoes_meta_idx").on(t.metaId),
  ],
);

export type Producao = typeof producao.$inferSelect;
export type NewProducao = typeof producao.$inferInsert;
