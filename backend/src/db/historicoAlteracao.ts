import { pgTable, bigserial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { operacaoHistoricoEnum } from "./enums.ts";

/**
 * Tabela única de histórico de alterações para todos os models.
 *
 * É populada automaticamente por uma trigger genérica no PostgreSQL
 * (ver `src/db/triggers/historico.sql` e `bun run db:triggers`), que registra
 * cada INSERT / UPDATE / DELETE das tabelas auditadas (as que têm `deleted_at`).
 */
export const historicoAlteracao = pgTable(
  "historico_alteracoes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tabela: text("tabela").notNull(),
    // Chave primária do registro (composta: valores unidos por ":"); NULL se a tabela
    // não tem PK nem coluna `id` (ver src/db/triggers/historico.sql).
    registroId: text("registro_id"),
    operacao: operacaoHistoricoEnum("operacao").notNull(),
    dadosAnteriores: jsonb("dados_anteriores"),
    dadosNovos: jsonb("dados_novos"),
    alteradoPor: text("alterado_por"),
    alteradoEm: timestamp("alterado_em", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("historico_alteracoes_tabela_idx").on(t.tabela),
    index("historico_alteracoes_registro_idx").on(t.tabela, t.registroId),
    index("historico_alteracoes_alterado_em_idx").on(t.alteradoEm),
    index("historico_alteracoes_alterado_por_idx").on(t.alteradoPor),
  ],
);

export type HistoricoAlteracao = typeof historicoAlteracao.$inferSelect;
export type NewHistoricoAlteracao = typeof historicoAlteracao.$inferInsert;
