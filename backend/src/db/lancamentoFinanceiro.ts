import { pgTable, uuid, text, date, bigint, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { meta } from "./meta.ts";
import { lancamentoTipoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/** Liberações e despesas do projeto (Meta 9 = Σ despesa ÷ Σ liberação). */
export const lancamentoFinanceiro = pgTable(
  "lancamentos_financeiros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    // Rubrica; nulo = geral do projeto (a meta precisa ser do mesmo projeto — service)
    metaId: uuid("meta_id").references(() => meta.id, { onDelete: "restrict" }),
    tipo: lancamentoTipoEnum("tipo").notNull(),
    descricao: text("descricao").notNull(),
    valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
    data: date("data").notNull(),
    // NF, empenho, OB…
    documentoRef: text("documento_ref"),
    ...auditColumns,
  },
  (t) => [
    check("lancamentos_financeiros_valor_ck", sql`${t.valorCentavos} > 0`),
    index("lancamentos_financeiros_projeto_data_idx").on(t.projetoId, t.data),
    index("lancamentos_financeiros_meta_idx").on(t.metaId),
  ],
);

export type LancamentoFinanceiro = typeof lancamentoFinanceiro.$inferSelect;
export type NewLancamentoFinanceiro = typeof lancamentoFinanceiro.$inferInsert;
