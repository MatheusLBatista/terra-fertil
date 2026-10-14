import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { papel } from "./papel.ts";

// Tabelas exigidas pelo Better Auth (plugin admin incluído: role/banned/...).
// Geradas a partir de `npx @better-auth/cli generate` e mantidas à mão.
// Datas em timestamptz (como as auditColumns) — o servidor deve rodar em TZ=UTC.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
  // FK por chave natural para papeis.nome: o better-auth segue gravando a
  // string, o banco garante que o papel existe. NULL = sem papel (nega tudo).
  // Renomear um papel propaga para os usuários (cascade).
  role: text("role").references(() => papel.nome, { onUpdate: "cascade", onDelete: "restrict" }),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
});

export type User = typeof user.$inferSelect;
