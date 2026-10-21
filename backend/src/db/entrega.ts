import { pgTable, uuid, text, date, integer, bigint, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { associacao } from "./associacao.ts";
import { item } from "./item.ts";
import { pedidoCompra } from "./pedidoCompra.ts";
import { entregaSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Destinação de um item a uma associação (Meta 4): nasce como demanda e termina
 * entregue, com termo de uso (arquivo privado no Garage).
 */
export const entrega = pgTable(
  "entregas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    associacaoId: uuid("associacao_id")
      .notNull()
      .references(() => associacao.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    pedidoId: uuid("pedido_id").references(() => pedidoCompra.id, { onDelete: "restrict" }),
    // "1ª Entrega de 2026"
    lote: text("lote"),
    quantidade: integer("quantidade").notNull().default(1),
    valorEstimadoCentavos: bigint("valor_estimado_centavos", { mode: "number" }),
    valorConsolidadoCentavos: bigint("valor_consolidado_centavos", { mode: "number" }),
    situacao: entregaSituacaoEnum("situacao").notNull().default("demandado"),
    dataPrevista: date("data_prevista"),
    dataEntrega: date("data_entrega"),
    termoUsoKey: text("termo_uso_key"),
    numeroSerie: text("numero_serie"),
    observacao: text("observacao"),
    ...auditColumns,
  },
  (t) => [
    check("entregas_quantidade_ck", sql`${t.quantidade} > 0`),
    check(
      "entregas_valores_ck",
      sql`coalesce(${t.valorEstimadoCentavos}, 0) >= 0 and coalesce(${t.valorConsolidadoCentavos}, 0) >= 0`,
    ),
    check("entregas_entregue_ck", sql`(${t.situacao} = 'entregue') = (${t.dataEntrega} is not null)`),
    index("entregas_projeto_situacao_idx").on(t.projetoId, t.situacao),
    index("entregas_associacao_idx").on(t.associacaoId),
    index("entregas_item_idx").on(t.itemId),
    index("entregas_pedido_idx").on(t.pedidoId),
  ],
);

export type Entrega = typeof entrega.$inferSelect;
export type NewEntrega = typeof entrega.$inferInsert;
