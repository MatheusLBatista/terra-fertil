import { and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { tipoDocumento, type NewTipoDocumento } from "../db/tipoDocumento.ts";

/**
 * Documentos exigidos da associação — cabeçalhos da aba "Documentos" da planilha
 * de anotações, mais os dois documentos por projeto da Meta 2.
 * Idempotente pelo nome (case-insensitive).
 */
export const TIPOS_DOCUMENTO_SEED: NewTipoDocumento[] = [
  { nome: "Comprovante de inscrição e situação cadastral (CNPJ)", ordem: 1 },
  { nome: "Estatuto social", ordem: 2 },
  { nome: "Regimento interno", ordem: 3, obrigatorio: false },
  { nome: "Ata de eleição e posse da diretoria", ordem: 4 },
  { nome: "Comprovante de endereço", ordem: 5 },
  { nome: "Lista de membros", ordem: 6 },
  { nome: "Termo de parceria operacional", ordem: 7, porProjeto: true },
  { nome: "Plano de gestão de equipamentos", ordem: 8, porProjeto: true },
];

export async function seedTiposDocumento() {
  console.log("Seeding tipos de documento...");
  let inseridos = 0;
  for (const t of TIPOS_DOCUMENTO_SEED) {
    const [existente] = await db
      .select({ id: tipoDocumento.id })
      .from(tipoDocumento)
      .where(and(sql`lower(${tipoDocumento.nome}) = lower(${t.nome})`, isNull(tipoDocumento.deletedAt)))
      .limit(1);
    if (existente) continue;
    await db.insert(tipoDocumento).values(t);
    inseridos++;
  }
  console.log(`✓ ${inseridos} tipo(s) de documento inserido(s).`);
}

if (process.argv[1]?.endsWith("tiposDocumento.ts")) {
  seedTiposDocumento()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
