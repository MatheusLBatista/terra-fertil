import "dotenv/config";
import { seedEstados } from "./estados.ts";
import { seedMunicipios } from "./municipios.ts";
import { seedUsuarios } from "./usuarios.ts";
import { seedPapeis } from "./papeis.ts";
import { seedProjetos } from "./projetos.ts";

// Ordem de dependência: localização → papéis → usuários → domínio
async function main() {
  await seedEstados();
  await seedMunicipios();
  await seedPapeis();
  await seedUsuarios();
  await seedProjetos();
  console.log("\nTodos os seeds concluídos.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
