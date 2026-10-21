import { pgTable, uuid, text, date, bigint, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { associacao } from "./associacao.ts";
import { auditColumns } from "./audit.ts";

/**
 * Adesão da associação a um projeto. Guarda o que é DO PROJETO: interesse em
 * participar, demanda inicial de equipamentos e a parceria formal (Meta 2).
 * O diagnóstico da associação é único e fica em `diagnosticos_associacao`.
 */
export const projetoAssociacao = pgTable(
  "projeto_associacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    associacaoId: uuid("associacao_id")
      .notNull()
      .references(() => associacao.id, { onDelete: "restrict" }),
    aderiuEm: date("aderiu_em"),
    interesseDeclarado: boolean("interesse_declarado"),
    demandaInicial: text("demanda_inicial"),
    valorSugeridoCentavos: bigint("valor_sugerido_centavos", { mode: "number" }),
    parceriaFormalizadaEm: date("parceria_formalizada_em"),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("projeto_associacoes_unico_idx")
      .on(t.projetoId, t.associacaoId)
      .where(sql`${t.deletedAt} is null`),
    index("projeto_associacoes_projeto_idx").on(t.projetoId),
    index("projeto_associacoes_associacao_idx").on(t.associacaoId),
    check(
      "projeto_associacoes_valor_ck",
      sql`${t.valorSugeridoCentavos} is null or ${t.valorSugeridoCentavos} >= 0`,
    ),
  ],
);

export type ProjetoAssociacao = typeof projetoAssociacao.$inferSelect;
export type NewProjetoAssociacao = typeof projetoAssociacao.$inferInsert;
