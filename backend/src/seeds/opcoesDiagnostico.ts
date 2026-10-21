import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { opcaoDiagnostico, type NewOpcaoDiagnostico } from "../db/opcaoDiagnostico.ts";

type Grupo = NewOpcaoDiagnostico["grupo"];

/**
 * Opções de múltipla escolha dos diagnósticos — cabeçalhos de 2º nível das abas
 * Atividades, Solo, Capacitação, Apoio e Interesse da planilha de anotações.
 * O último item de cada grupo é o "Outro" (pede texto). Idempotente por grupo + nome.
 */
const GRUPOS: Record<Grupo, string[]> = {
  atividade_produtiva: [
    "Agricultura de subsistência",
    "Produção de grãos",
    "Hortaliças",
    "Fruticultura",
    "Café",
    "Pecuária de corte",
    "Pecuária leiteira",
    "Criação de pequenos animais",
    "Agroindústria ou beneficiamento",
    "Outro",
  ],
  problema_solo: [
    "Baixa fertilidade",
    "Solo muito ácido",
    "Compactação",
    "Erosão",
    "Falta de assistência técnica",
    "Falta de maquinário",
    "Outro",
  ],
  tema_capacitacao: [
    "Correção do solo",
    "Manejo sustentável",
    "Uso de máquinas",
    "Cultivos específicos",
    "Outro",
  ],
  parceiro_institucional: ["EMATER", "SEAGRI", "SENAR", "Prefeitura", "ONG/projeto social", "Outro"],
  apoio_necessario: [
    "Análise de solo",
    "Capacitação técnica",
    "Implementos agrícolas",
    "Suporte técnico",
    "Organização comunitária",
    "Outro",
  ],
};

export const OPCOES_DIAGNOSTICO_SEED: NewOpcaoDiagnostico[] = Object.entries(GRUPOS).flatMap(
  ([grupo, nomes]) =>
    nomes.map((nome, i) => ({
      grupo: grupo as Grupo,
      nome,
      ordem: i + 1,
      permiteDetalhe: nome === "Outro",
    })),
);

export async function seedOpcoesDiagnostico() {
  console.log("Seeding opções de diagnóstico...");
  let inseridos = 0;
  for (const o of OPCOES_DIAGNOSTICO_SEED) {
    const [existente] = await db
      .select({ id: opcaoDiagnostico.id })
      .from(opcaoDiagnostico)
      .where(
        and(
          eq(opcaoDiagnostico.grupo, o.grupo),
          sql`lower(${opcaoDiagnostico.nome}) = lower(${o.nome})`,
          isNull(opcaoDiagnostico.deletedAt),
        ),
      )
      .limit(1);
    if (existente) continue;
    await db.insert(opcaoDiagnostico).values(o);
    inseridos++;
  }
  console.log(`✓ ${inseridos} opção(ões) de diagnóstico inserida(s).`);
}

if (process.argv[1]?.endsWith("opcoesDiagnostico.ts")) {
  seedOpcoesDiagnostico()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
