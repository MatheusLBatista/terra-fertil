import { pgTable, uuid, text, boolean, smallint, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { auditColumns } from "./audit.ts";

/**
 * Catálogo dos documentos exigidos da associação (editável no painel).
 * `porProjeto`: um documento por projeto (Termo de parceria, Plano de gestão);
 * senão é da associação, valendo para todos os projetos (Estatuto…).
 */
export const tipoDocumento = pgTable(
  "tipos_documento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    obrigatorio: boolean("obrigatorio").notNull().default(true),
    porProjeto: boolean("por_projeto").notNull().default(false),
    ordem: smallint("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("tipos_documento_nome_unico_idx")
      .on(sql`lower(${t.nome})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type TipoDocumento = typeof tipoDocumento.$inferSelect;
export type NewTipoDocumento = typeof tipoDocumento.$inferInsert;
