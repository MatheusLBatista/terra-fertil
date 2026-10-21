import { pgTable, uuid, text, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { evento } from "./evento.ts";
import { produtor } from "./produtor.ts";
import { auditColumns } from "./audit.ts";

/** Lista de presença do evento — "agricultores capacitados" = produtores distintos presentes. */
export const eventoParticipante = pgTable(
  "evento_participantes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "cascade" }),
    produtorId: uuid("produtor_id")
      .notNull()
      .references(() => produtor.id, { onDelete: "restrict" }),
    presente: boolean("presente").notNull().default(false),
    certificadoKey: text("certificado_key"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("evento_participantes_unico_idx")
      .on(t.eventoId, t.produtorId)
      .where(sql`${t.deletedAt} is null`),
    index("evento_participantes_evento_idx").on(t.eventoId),
    index("evento_participantes_produtor_idx").on(t.produtorId),
  ],
);

export type EventoParticipante = typeof eventoParticipante.$inferSelect;
export type NewEventoParticipante = typeof eventoParticipante.$inferInsert;
