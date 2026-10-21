import { pgTable, uuid, text, boolean, smallint, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { grupoOpcaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Catálogo das respostas de múltipla escolha dos diagnósticos (atividades
 * produtivas, problemas de solo, temas de capacitação…), editável no painel.
 * `permiteDetalhe` marca o "Outro" — a resposta pede um texto.
 */
export const opcaoDiagnostico = pgTable(
  "opcoes_diagnostico",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grupo: grupoOpcaoEnum("grupo").notNull(),
    nome: text("nome").notNull(),
    permiteDetalhe: boolean("permite_detalhe").notNull().default(false),
    ordem: smallint("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("opcoes_diagnostico_grupo_nome_unico_idx")
      .on(t.grupo, sql`lower(${t.nome})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type OpcaoDiagnostico = typeof opcaoDiagnostico.$inferSelect;
export type NewOpcaoDiagnostico = typeof opcaoDiagnostico.$inferInsert;
