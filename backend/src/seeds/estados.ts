import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { db } from "../db/index.ts";
import { estado, type NewEstado } from "../db/estado.ts";

/**
 * Insere os 27 estados a partir de `data/estados.json` (baixado do IBGE com
 * `bun run ibge:download`). Idempotente: `onConflictDoNothing`.
 */
export async function seedEstados() {
  console.log("Seeding estados...");
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), "data", "estados.json");
  const estados = JSON.parse(readFileSync(dataPath, "utf8")) as NewEstado[];

  await db.insert(estado).values(estados).onConflictDoNothing();
  console.log(`✓ ${estados.length} estados inseridos (ou já existiam).`);
}

if (process.argv[1]?.endsWith("estados.ts")) {
  seedEstados()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
