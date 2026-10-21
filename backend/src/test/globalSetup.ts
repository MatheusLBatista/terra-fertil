import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { aplicarEnvDeTeste, garantirBancoDeTeste, DATABASE_URL_TEST } from "./env.ts";

/**
 * globalSetup do projeto `integration` (roda UMA vez, no processo principal do
 * vitest, antes de todos os arquivos `*.integration.test.ts`):
 *
 * 1. aponta `DATABASE_URL` para o banco de teste — ANTES de importar qualquer
 *    coisa de `src/` (por isso os imports da aplicação são dinâmicos);
 * 2. recria o banco de teste do zero (DROP SCHEMA public/drizzle) — o banco é
 *    descartável, e assim `migrate` e `push` nunca divergem do que já existe;
 * 3. aplica o schema: `drizzle-kit migrate` se existem migrations versionadas
 *    (drizzle/meta/_journal.json), senão `drizzle-kit push --force` — mesmo
 *    critério do `src/scripts/setupDb.ts`;
 * 4. cria a trigger de histórico (src/db/triggers/historico.sql);
 * 5. seeds de papéis/permissões e usuários (os do IBGE são lentos e ficam de
 *    fora — um teste que precise de estados/municípios importa `seedEstados`
 *    no seu próprio `beforeAll`).
 */
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

function rodar(descricao: string, args: string[]) {
  const r = spawnSync("bunx", args, {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: DATABASE_URL_TEST },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`[integration] falhou: ${descricao}`);
  }
}

export default async function setup() {
  aplicarEnvDeTeste();
  garantirBancoDeTeste(DATABASE_URL_TEST);
  console.log(`[integration] banco de teste: ${DATABASE_URL_TEST.replace(/:\/\/.*@/, "://***@")}`);

  // Banco limpo a cada rodada (mesmo que src/scripts/resetDb.ts). Pool próprio
  // do `pg`: nada de src/ foi importado ainda.
  const reset = new Pool({ connectionString: DATABASE_URL_TEST });
  await reset.query("DROP SCHEMA IF EXISTS public CASCADE");
  await reset.query("CREATE SCHEMA public");
  await reset.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await reset.end();

  const temMigrations = existsSync(`${RAIZ}drizzle/meta/_journal.json`);
  if (temMigrations) {
    rodar("drizzle-kit migrate", ["drizzle-kit", "migrate"]);
  } else {
    rodar("drizzle-kit push --force", ["drizzle-kit", "push", "--force"]);
  }

  // Imports dinâmicos: só agora DATABASE_URL aponta para o banco de teste
  const { pool } = await import("../db/index.ts");
  await pool.query(readFileSync(`${RAIZ}src/db/triggers/historico.sql`, "utf8"));

  const { seedPapeis } = await import("../seeds/papeis.ts");
  const { seedUsuarios } = await import("../seeds/usuarios.ts");
  await seedPapeis();
  await seedUsuarios();

  await pool.end();
  console.log(`[integration] schema (${temMigrations ? "migrate" : "push"}) + trigger + seeds prontos.`);
}
