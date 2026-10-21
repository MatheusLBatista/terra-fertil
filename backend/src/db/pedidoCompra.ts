import { pgTable, uuid, text, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projeto } from "./projeto.ts";
import { pedidoSituacaoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/** Processo de compra com recurso do projeto — um pedido atende várias associações. */
export const pedidoCompra = pgTable(
  "pedidos_compra",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projeto.id, { onDelete: "restrict" }),
    numero: text("numero").notNull(),
    descricao: text("descricao"),
    fornecedor: text("fornecedor"),
    situacao: pedidoSituacaoEnum("situacao").notNull().default("aberto"),
    dataPedido: date("data_pedido"),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex("pedidos_compra_numero_unico_idx")
      .on(t.numero)
      .where(sql`${t.deletedAt} is null`),
    index("pedidos_compra_projeto_idx").on(t.projetoId, t.situacao),
  ],
);

export type PedidoCompra = typeof pedidoCompra.$inferSelect;
export type NewPedidoCompra = typeof pedidoCompra.$inferInsert;
