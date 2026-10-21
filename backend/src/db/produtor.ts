import { pgTable, uuid, text, varchar, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user.ts";
import { auditColumns } from "./audit.ts";

/**
 * Perfil 1:1 do usuário que é agricultor. Nome, e-mail e telefone ficam no `user`.
 * `userId` tem unique TOTAL: perfil excluído é reativado, não recriado.
 * `ativo` é o status no projeto — bloquear o login é `user.banned`.
 */
export const produtor = pgTable(
  "produtores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "restrict" }),
    // Só dígitos; o dígito verificador é validado no zod
    cpf: varchar("cpf", { length: 11 }),
    observacao: text("observacao"),
    ativo: boolean("ativo").notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("produtores_cpf_unico_idx")
      .on(t.cpf)
      .where(sql`${t.deletedAt} is null and ${t.cpf} is not null`),
  ],
);

export type Produtor = typeof produtor.$inferSelect;
export type NewProdutor = typeof produtor.$inferInsert;
