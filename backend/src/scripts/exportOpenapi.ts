import "dotenv/config";
import { writeFileSync } from "node:fs";
import { getMergedSpec } from "../app.ts";

/**
 * Exporta o OpenAPI (módulos + Better Auth) para ./openapi.json, sem precisar
 * subir o servidor. O front também pode gerar os types direto da API no ar
 * (http://localhost:3080/docs/openapi.json).
 *
 * Uso: npm run openapi:export
 */
const spec = await getMergedSpec();
writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
console.log("✓ openapi.json exportado.");
process.exit(0);
