import { pgTable, uuid, text, integer, date, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { associacao } from "./associacao.ts";
import { tipoDocumento } from "./tipoDocumento.ts";
import { projeto } from "./projeto.ts";
import { documentoSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Documento entregue pela associação. Arquivo privado no Garage (`arquivoKey`),
 * servido por proxy autenticado. `projetoId` só nos tipos `porProjeto` (o service
 * garante). Nova versão = soft delete da anterior; o histórico guarda tudo.
 */
export const associacaoDocumento = pgTable(
  "associacao_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associacaoId: uuid("associacao_id")
      .notNull()
      .references(() => associacao.id, { onDelete: "cascade" }),
    tipoDocumentoId: uuid("tipo_documento_id")
      .notNull()
      .references(() => tipoDocumento.id, { onDelete: "restrict" }),
    projetoId: uuid("projeto_id").references(() => projeto.id, { onDelete: "restrict" }),
    situacao: documentoSituacaoEnum("situacao").notNull().default("pendente"),
    arquivoKey: text("arquivo_key"),
    nomeArquivo: text("nome_arquivo"),
    mimeType: text("mime_type"),
    tamanhoBytes: integer("tamanho_bytes"),
    validade: date("validade"),
    observacao: text("observacao"),
    ...auditColumns,
  },
  (t) => [
    // Um documento vigente por (associação, tipo, projeto) — projeto nulo conta como valor
    // (o índice do Drizzle não tem NULLS NOT DISTINCT; o coalesce faz o mesmo papel)
    uniqueIndex("associacao_documentos_vigente_unico_idx")
      .on(
        t.associacaoId,
        t.tipoDocumentoId,
        sql`coalesce(${t.projetoId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.deletedAt} is null`),
    index("associacao_documentos_associacao_idx").on(t.associacaoId),
    index("associacao_documentos_tipo_idx").on(t.tipoDocumentoId),
    index("associacao_documentos_projeto_idx").on(t.projetoId),
    check("associacao_documentos_tamanho_ck", sql`${t.tamanhoBytes} is null or ${t.tamanhoBytes} >= 0`),
  ],
);

export type AssociacaoDocumento = typeof associacaoDocumento.$inferSelect;
export type NewAssociacaoDocumento = typeof associacaoDocumento.$inferInsert;
