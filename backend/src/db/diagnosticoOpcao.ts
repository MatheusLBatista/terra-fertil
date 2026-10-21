import { pgTable, uuid, text, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { diagnosticoAssociacao } from "./diagnosticoAssociacao.ts";
import { visita } from "./visita.ts";
import { opcaoDiagnostico } from "./opcaoDiagnostico.ts";
import { auditColumns } from "./audit.ts";

/**
 * Opções marcadas num diagnóstico: o da associação (`associacaoId`) OU o da
 * visita na propriedade (`visitaId`) — exatamente um dos dois.
 */
export const diagnosticoOpcao = pgTable(
  "diagnostico_opcoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associacaoId: uuid("associacao_id").references(() => diagnosticoAssociacao.associacaoId, {
      onDelete: "cascade",
    }),
    visitaId: uuid("visita_id").references(() => visita.id, { onDelete: "cascade" }),
    opcaoId: uuid("opcao_id")
      .notNull()
      .references(() => opcaoDiagnostico.id, { onDelete: "restrict" }),
    // Texto do "Outro"
    detalhe: text("detalhe"),
    ...auditColumns,
  },
  (t) => [
    check("diagnostico_opcoes_alvo_ck", sql`num_nonnulls(${t.associacaoId}, ${t.visitaId}) = 1`),
    uniqueIndex("diagnostico_opcoes_unico_idx")
      .on(sql`coalesce(${t.associacaoId}, ${t.visitaId})`, t.opcaoId)
      .where(sql`${t.deletedAt} is null`),
    index("diagnostico_opcoes_associacao_idx").on(t.associacaoId),
    index("diagnostico_opcoes_visita_idx").on(t.visitaId),
    index("diagnostico_opcoes_opcao_idx").on(t.opcaoId),
  ],
);

export type DiagnosticoOpcao = typeof diagnosticoOpcao.$inferSelect;
export type NewDiagnosticoOpcao = typeof diagnosticoOpcao.$inferInsert;
