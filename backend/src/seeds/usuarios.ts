import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { user } from "../db/user.ts";
import { auth } from "../lib/auth.ts";
import { env, SENHA_DEMO } from "../lib/env.ts";

/**
 * Usuários iniciais — criados pelo próprio better-auth (plugin admin), então
 * o hash da senha é sempre o formato que a lib espera, sem replicar scrypt à mão.
 *
 * - O admin vem do .env (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME). Em
 *   produção os três são OBRIGATÓRIOS (o seed aborta sem eles); fora dela
 *   valem os valores de demonstração.
 * - As contas demo de gestor e usuário só entram fora de produção.
 * - Conta que já existe não é tocada (nem o papel — quem manda é o painel).
 */
export const SENHA_PADRAO = SENHA_DEMO;

const isProd = env.NODE_ENV === "production";

if (isProd && !(env.ADMIN_EMAIL && env.ADMIN_PASSWORD && env.ADMIN_NAME)) {
  console.error(
    "✖ Em produção defina ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_NAME no .env (conta admin do primeiro deploy).",
  );
  process.exit(1);
}

export const USUARIOS_DEMO = [
  {
    name: env.ADMIN_NAME ?? "Admin Sistema",
    email: env.ADMIN_EMAIL ?? "admin@example.com",
    role: "admin",
    password: env.ADMIN_PASSWORD ?? SENHA_PADRAO,
  },
  ...(isProd
    ? []
    : [
        { name: "Gestor Demo", email: "gestor@example.com", role: "gestor", password: SENHA_PADRAO },
        { name: "Usuário Demo", email: "usuario@example.com", role: "usuario", password: SENHA_PADRAO },
      ]),
];

export async function seedUsuarios() {
  console.log("Seeding usuários...");
  let inseridos = 0;

  for (const u of USUARIOS_DEMO) {
    const existente = await db.select({ id: user.id }).from(user).where(eq(user.email, u.email)).limit(1);

    if (existente.length > 0) {
      console.log(`  - ${u.email} já existe, pulando.`);
      continue;
    }

    await auth.api.createUser({
      body: { email: u.email, password: u.password, name: u.name, role: u.role as "admin" },
    });
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, u.email));

    console.log(`  + ${u.email} (${u.role})`);
    inseridos++;
  }

  console.log(`✓ ${inseridos} usuários inseridos (${USUARIOS_DEMO.length - inseridos} já existiam).`);
}

if (process.argv[1]?.endsWith("usuarios.ts")) {
  seedUsuarios()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
