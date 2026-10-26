import { pgTable, uuid, text, integer, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { entrega } from "./entrega.ts";
import { visitaAtividadeVerificada } from "./visitaAtividadeVerificada.ts";
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
    // Foto de um item verificado no acompanhamento da associação (a entrega conferida)
    entregaId: uuid("entrega_id").references(() => entrega.id, { onDelete: "restrict" }),
    // Foto de uma atividade verificada na assistência técnica
    atividadeVerificadaId: uuid("atividade_verificada_id").references(() => visitaAtividadeVerificada.id, {
      onDelete: "restrict",
    }),
    ...auditColumns,
  },
  (t) => [
    index("visita_anexos_visita_idx").on(t.visitaId),
    index("visita_anexos_entrega_idx").on(t.entregaId),
    index("visita_anexos_atividade_verificada_idx").on(t.atividadeVerificadaId),
    check("visita_anexos_tamanho_ck", sql`${t.tamanhoBytes} >= 0`),
  ],
);

export type VisitaAnexo = typeof visitaAnexo.$inferSelect;
export type NewVisitaAnexo = typeof visitaAnexo.$inferInsert;
