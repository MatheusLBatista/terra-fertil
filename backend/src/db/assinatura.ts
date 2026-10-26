import { pgTable, uuid, text, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { entrega } from "./entrega.ts";
import { associacaoDocumento } from "./associacaoDocumento.ts";
import { assinantePapelEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Assinatura eletrônica simples (traço desenhado na tela): a visita de
 * acompanhamento/assistência, o termo de uso da entrega ou um documento da
 * associação — exatamente um alvo. A imagem (PNG) é privada no Garage; quem
 * registrou fica no `createdBy`. Uma assinatura viva por alvo.
 */
export const assinatura = pgTable(
  "assinaturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitaId: uuid("visita_id").references(() => visita.id, { onDelete: "cascade" }),
    entregaId: uuid("entrega_id").references(() => entrega.id, { onDelete: "restrict" }),
    associacaoDocumentoId: uuid("associacao_documento_id").references(() => associacaoDocumento.id, {
      onDelete: "cascade",
    }),
    nome: text("nome").notNull(),
    papel: assinantePapelEnum("papel").notNull(),
    imagemKey: text("imagem_key").notNull(),
    assinadoEm: timestamp("assinado_em", { withTimezone: true }).notNull().defaultNow(),
    ...auditColumns,
  },
  (t) => [
    check(
      "assinaturas_alvo_ck",
      sql`num_nonnulls(${t.visitaId}, ${t.entregaId}, ${t.associacaoDocumentoId}) = 1`,
    ),
    uniqueIndex("assinaturas_visita_unico_idx")
      .on(t.visitaId)
      .where(sql`${t.deletedAt} is null and ${t.visitaId} is not null`),
    uniqueIndex("assinaturas_entrega_unico_idx")
      .on(t.entregaId)
      .where(sql`${t.deletedAt} is null and ${t.entregaId} is not null`),
    uniqueIndex("assinaturas_documento_unico_idx")
      .on(t.associacaoDocumentoId)
      .where(sql`${t.deletedAt} is null and ${t.associacaoDocumentoId} is not null`),
    index("assinaturas_visita_idx").on(t.visitaId),
    index("assinaturas_entrega_idx").on(t.entregaId),
    index("assinaturas_documento_idx").on(t.associacaoDocumentoId),
  ],
);

export type Assinatura = typeof assinatura.$inferSelect;
export type NewAssinatura = typeof assinatura.$inferInsert;
