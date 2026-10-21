import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { db } from "../db/index.ts";
import { municipio, type NewMunicipio } from "../db/municipio.ts";

/**
 * Insere os ~5.570 municípios do Brasil a partir de `data/municipios.json`
 * (baixado do IBGE com `bun run ibge:download`). Idempotente e em lotes.
 */
export async function seedMunicipios() {
  console.log("Seeding municípios...");
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), "data", "municipios.json");
  const municipios = JSON.parse(readFileSync(dataPath, "utf8")) as NewMunicipio[];

  const LOTE = 1_000;
  for (let i = 0; i < municipios.length; i += LOTE) {
    await db
      .insert(municipio)
      .values(municipios.slice(i, i + LOTE))
      .onConflictDoNothing();
  }
  console.log(`✓ ${municipios.length} municípios inseridos (ou já existiam).`);
}

if (process.argv[1]?.endsWith("municipios.ts")) {
  seedMunicipios()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
