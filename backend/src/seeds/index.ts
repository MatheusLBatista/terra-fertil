import "dotenv/config";
import { seedEstados } from "./estados.ts";
import { seedMunicipios } from "./municipios.ts";
import { seedUsuarios } from "./usuarios.ts";
import { seedPapeis } from "./papeis.ts";
import { seedProjetos } from "./projetos.ts";
import { seedTiposDocumento } from "./tiposDocumento.ts";
import { seedOpcoesDiagnostico } from "./opcoesDiagnostico.ts";

// Ordem de dependência: localização → papéis → usuários → domínio
async function main() {
  await seedEstados();
  await seedMunicipios();
  await seedPapeis();
  await seedUsuarios();
  await seedProjetos();
  await seedTiposDocumento();
  await seedOpcoesDiagnostico();
  console.log("\nTodos os seeds concluídos.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
