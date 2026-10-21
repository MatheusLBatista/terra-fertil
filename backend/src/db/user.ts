import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { papel } from "./papel.ts";

// Tabelas exigidas pelo Better Auth (plugin admin incluído: role/banned/...).
// Geradas a partir de `bunx @better-auth/cli generate` e mantidas à mão.
// Datas em timestamptz (como as auditColumns) — o servidor deve rodar em TZ=UTC.
export const user = pgTable(
  "user",
  {
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
    // Telefone em E.164 sem "+" (ex.: 5569993453103). Mesmos nomes do plugin
    // `phoneNumber` do better-auth — ligá-lo depois (login por OTP) não muda o schema.
    // Pessoa sem e-mail recebe um e-mail técnico <telefone>@sem-email.invalid.
    phoneNumber: text("phone_number").unique(),
    phoneNumberVerified: boolean("phone_number_verified"),
    banned: boolean("banned"),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
  },
  // FK sempre com índice (o Postgres não indexa FK sozinho).
  (t) => [index("user_role_idx").on(t.role)],
);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
