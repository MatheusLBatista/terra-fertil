import { pgTable, uuid, text, date, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { propriedade } from "./propriedade.ts";
import { visita } from "./visita.ts";
import { auditColumns } from "./audit.ts";

/**
 * Necessidade de análise de solo de uma propriedade (Meta 3). Nasce quando a
 * necessidade é identificada e depois recebe o LINK do laudo. Amostras,
 * resultados de laboratório e o arquivo do laudo ficam fora do sistema.
 * Situação é derivada: sem `laudoUrl` = pendente; com = laudo disponível.
 */
export const analiseSolo = pgTable(
  "analises_solo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    propriedadeId: uuid("propriedade_id")
      .notNull()
      .references(() => propriedade.id, { onDelete: "restrict" }),
    // Visita (na mesma propriedade) em que a necessidade foi identificada
    visitaId: uuid("visita_id").references(() => visita.id, { onDelete: "set null" }),
    identificadaEm: date("identificada_em").notNull(),
    observacao: text("observacao"),
    laudoUrl: text("laudo_url"),
    laudoRegistradoEm: date("laudo_registrado_em"),
    ...auditColumns,
  },
  (t) => [
    check("analises_solo_laudo_ck", sql`(${t.laudoUrl} is null) = (${t.laudoRegistradoEm} is null)`),
    index("analises_solo_projeto_data_idx").on(t.projetoId, t.identificadaEm),
    index("analises_solo_propriedade_idx").on(t.propriedadeId),
    index("analises_solo_visita_idx").on(t.visitaId),
  ],
);

export type AnaliseSolo = typeof analiseSolo.$inferSelect;
export type NewAnaliseSolo = typeof analiseSolo.$inferInsert;
