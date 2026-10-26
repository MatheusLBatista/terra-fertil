import { pgTable, uuid, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { visita } from "./visita.ts";
import { opcaoDiagnostico } from "./opcaoDiagnostico.ts";
import { subdivisaoAtividade } from "./subdivisaoAtividade.ts";
import { auditColumns } from "./audit.ts";

/**
 * Atividade produtiva da propriedade (ou uma subdivisão dela) conferida na
 * visita de assistência técnica. As fotos ficam em `visita_anexos` apontando para cá.
 */
export const visitaAtividadeVerificada = pgTable(
  "visita_atividades_verificadas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitaId: uuid("visita_id")
      .notNull()
      .references(() => visita.id, { onDelete: "cascade" }),
    opcaoId: uuid("opcao_id")
      .notNull()
      .references(() => opcaoDiagnostico.id, { onDelete: "restrict" }),
    // Null = a atividade inteira (sem subdivisões no catálogo)
    subdivisaoId: uuid("subdivisao_id").references(() => subdivisaoAtividade.id, { onDelete: "restrict" }),
    observacao: text("observacao"),
    ...auditColumns,
  },
  (t) => [
    // Uma verificação viva por atividade/subdivisão na visita (null conta como valor)
    uniqueIndex("visita_atividades_verificadas_unico_idx")
      .on(
        t.visitaId,
        t.opcaoId,
        sql`coalesce(${t.subdivisaoId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.deletedAt} is null`),
    index("visita_atividades_verificadas_visita_idx").on(t.visitaId),
    index("visita_atividades_verificadas_opcao_idx").on(t.opcaoId),
    index("visita_atividades_verificadas_subdivisao_idx").on(t.subdivisaoId),
  ],
);

export type VisitaAtividadeVerificada = typeof visitaAtividadeVerificada.$inferSelect;
export type NewVisitaAtividadeVerificada = typeof visitaAtividadeVerificada.$inferInsert;
