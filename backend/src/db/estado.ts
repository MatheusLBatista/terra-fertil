import { pgTable, integer, varchar, text } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit.ts";

/** PK = código IBGE do estado (11 = RO ... 53 = DF). */
export const estado = pgTable("estados", {
  id: integer("id").primaryKey(),
  nome: text("nome").notNull(),
  sigla: varchar("sigla", { length: 2 }).notNull().unique(),
  ...auditColumns,
});

export type Estado = typeof estado.$inferSelect;
export type NewEstado = typeof estado.$inferInsert;
