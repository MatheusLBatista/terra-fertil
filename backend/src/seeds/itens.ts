import { and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { item, type NewItem } from "../db/item.ts";

/**
 * Itens já cotados na aba "Demandas" (1ª Entrega de 2026), com o valor estimado
 * de lá como referência. Idempotente pela descrição (case-insensitive).
 */
export const ITENS_SEED: NewItem[] = [
  {
    descricao: "Trator de pneu 4x4 60 cv plataformado",
    tipo: "investimento",
    categoria: "maquina",
    valorReferenciaCentavos: 20_500_000,
  },
  { descricao: "Trator plataformado 4x4 75 cv", tipo: "investimento", categoria: "maquina" },
  {
    descricao: "Grade aradora 12 discos",
    tipo: "investimento",
    categoria: "implemento",
    valorReferenciaCentavos: 4_250_000,
  },
  { descricao: "Grade aradora 14 discos", tipo: "investimento", categoria: "implemento" },
  { descricao: "Carreta basculante 5 toneladas", tipo: "investimento", categoria: "implemento" },
  { descricao: "Enxada rotativa/Encanteirador 1,2 m", tipo: "investimento", categoria: "implemento" },
  { descricao: "Distribuidor de corretivo e adubo", tipo: "investimento", categoria: "implemento" },
  { descricao: "Colhedora de Milho Grão Foguetinho", tipo: "investimento", categoria: "maquina" },
  { descricao: "Colhedora de Forragem Ensiladeira 1,2 m", tipo: "investimento", categoria: "maquina" },
  // Insumo citado na reunião de 23/10 (demanda → fornecimento → acompanhamento)
  { descricao: "Calcário dolomítico", tipo: "custeio", categoria: "insumo", unidade: "t" },
];

export async function seedItens() {
  console.log("Seeding itens...");
  let inseridos = 0;
  for (const i of ITENS_SEED) {
    const [existente] = await db
      .select({ id: item.id })
      .from(item)
      .where(and(sql`lower(${item.descricao}) = lower(${i.descricao})`, isNull(item.deletedAt)))
      .limit(1);
    if (existente) continue;
    await db.insert(item).values(i);
    inseridos++;
  }
  console.log(`✓ ${inseridos} item(ns) inserido(s).`);
}

if (process.argv[1]?.endsWith("itens.ts")) {
  seedItens()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
