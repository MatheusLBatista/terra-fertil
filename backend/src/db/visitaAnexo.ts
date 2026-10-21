import { pgTable, uuid, text, integer, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { anexoTipoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/** Fotos e documentos da visita — arquivo privado no Garage, servido por proxy autenticado. */
export const visitaAnexo = pgTable(
  "visita_anexos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visita.id, { onDelete: "cascade" }),
    tipo: anexoTipoEnum("tipo").notNull(),
    arquivoKey: text("arquivo_key").notNull(),
    nomeArquivo: text("nome_arquivo").notNull(),
    mimeType: text("mime_type").notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    legenda: text("legenda"),
    ...auditColumns,
  },
  (t) => [
    index("visita_anexos_visita_idx").on(t.visitaId),
    check("visita_anexos_tamanho_ck", sql`${t.tamanhoBytes} >= 0`),
  ],
);

export type VisitaAnexo = typeof visitaAnexo.$inferSelect;
export type NewVisitaAnexo = typeof visitaAnexo.$inferInsert;
