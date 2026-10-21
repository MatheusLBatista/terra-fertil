import { pgTable, uuid, text, date, bigint, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projetoSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Projeto/convênio. Metas e registros operacionais (visitas, análises de solo,
 * entregas, eventos…) pertencem a um projeto; o cadastro (associações, pessoas,
 * propriedades) é compartilhado. Projeto `encerrado` é somente leitura.
 *
 * Dinheiro em centavos como `bigint` (mode number): o valor dos convênios passa
 * do limite do `integer` (R$ 45 mi = 4,5 bi de centavos).
 */
export const projeto = pgTable(
  "projetos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sigla: text("sigla").notNull(),
    nome: text("nome").notNull(),
    numeroInstrumento: text("numero_instrumento"),
    concedente: text("concedente"),
    executor: text("executor"),
    inicio: date("inicio").notNull(),
    fim: date("fim").notNull(),
    valorTotalCentavos: bigint("valor_total_centavos", { mode: "number" }).notNull().default(0),
    situacao: projetoSituacaoEnum("situacao").notNull().default("planejado"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("projetos_sigla_unico_idx")
      .on(sql`lower(${t.sigla})`)
      .where(sql`${t.deletedAt} is null`),
    index("projetos_situacao_idx").on(t.situacao),
    check("projetos_periodo_ck", sql`${t.fim} >= ${t.inicio}`),
    check("projetos_valor_nao_negativo", sql`${t.valorTotalCentavos} >= 0`),
  ],
);

export type Projeto = typeof projeto.$inferSelect;
export type NewProjeto = typeof projeto.$inferInsert;
