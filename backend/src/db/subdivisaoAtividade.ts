import { pgTable, uuid, text, boolean, smallint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { opcaoDiagnostico } from "./opcaoDiagnostico.ts";
import { auditColumns } from "./audit.ts";

/**
 * Subdivisão de uma atividade produtiva do catálogo (ex.: Pecuária leiteira →
 * ordenha, pastagem, sanidade). A assistência técnica verifica cada uma.
 */
export const subdivisaoAtividade = pgTable(
  "subdivisoes_atividade",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opcaoId: uuid("opcao_id")
      .notNull()
      .references(() => opcaoDiagnostico.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    ordem: smallint("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("subdivisoes_atividade_nome_unico_idx")
      .on(t.opcaoId, sql`lower(${t.nome})`)
      .where(sql`${t.deletedAt} is null`),
    index("subdivisoes_atividade_opcao_idx").on(t.opcaoId),
  ],
);

export type SubdivisaoAtividade = typeof subdivisaoAtividade.$inferSelect;
export type NewSubdivisaoAtividade = typeof subdivisaoAtividade.$inferInsert;
