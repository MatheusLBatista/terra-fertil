import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { projeto, type NewProjeto } from "../db/projeto.ts";

/**
 * Projetos iniciais. Hoje só o Terra Fértil — todo dado importado das
 * planilhas de docs/ aponta para ele. Idempotente pela sigla (case-insensitive).
 *
 * Vigência e nº do instrumento: as planilhas não trazem — ajuste pelo painel.
 * Valor total = soma do valor aprovado das 10 metas (aba Resumo): R$ 55.000.000,00.
 */
export const PROJETOS_SEED: NewProjeto[] = [
  {
    sigla: "TERRA-FERTIL",
    nome: "Projeto Terra Fértil",
    executor: "IFRO",
    inicio: "2025-01-01",
    fim: "2027-12-31",
    valorTotalCentavos: 5_500_000_000,
    situacao: "em_execucao",
  },
];

export async function seedProjetos() {
  console.log("Seeding projetos...");
  let inseridos = 0;
  for (const p of PROJETOS_SEED) {
    const [existente] = await db
      .select({ id: projeto.id })
      .from(projeto)
      .where(and(sql`lower(${projeto.sigla}) = lower(${p.sigla})`, isNull(projeto.deletedAt)))
      .limit(1);
    if (existente) {
      console.log(`  - ${p.sigla} já existe, pulando.`);
      continue;
    }
    await db.insert(projeto).values(p);
    console.log(`  + ${p.sigla}`);
    inseridos++;
  }
  console.log(`✓ ${inseridos} projeto(s) inserido(s).`);
}

/** Id do projeto pela sigla — usado pelos seeds que dependem dele. */
export async function idDoProjeto(sigla: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: projeto.id })
    .from(projeto)
    .where(and(eq(sql`lower(${projeto.sigla})`, sigla.toLowerCase()), isNull(projeto.deletedAt)))
    .limit(1);
  return row?.id;
}

if (process.argv[1]?.endsWith("projetos.ts")) {
  seedProjetos()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
