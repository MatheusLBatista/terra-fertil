import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { pedidoCompra, type NewPedidoCompra } from "../../db/pedidoCompra.ts";
import { entrega } from "../../db/entrega.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  numero: pedidoCompra.numero,
  dataPedido: pedidoCompra.dataPedido,
  createdAt: pedidoCompra.createdAt,
} as const;

type Filtros = {
  projetoId?: string;
  situacao?: (typeof pedidoCompra.situacao.enumValues)[number];
  busca?: string;
  escopo?: Escopo;
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

// Totais das entregas vivas do pedido (subconsulta correlacionada — sem GROUP BY na listagem)
const entregasDoPedido = sql`${entrega.pedidoId} = ${pedidoCompra.id} and ${entrega.deletedAt} is null`;

const colunas = {
  id: pedidoCompra.id,
  projetoId: pedidoCompra.projetoId,
  numero: pedidoCompra.numero,
  descricao: pedidoCompra.descricao,
  fornecedor: pedidoCompra.fornecedor,
  situacao: pedidoCompra.situacao,
  dataPedido: pedidoCompra.dataPedido,
  totalEntregas: sql<number>`(select cast(count(*) as int) from ${entrega} where ${entregasDoPedido})`,
  valorConsolidadoCentavos:
    sql<number>`(select coalesce(sum(${entrega.valorConsolidadoCentavos}), 0) from ${entrega} where ${entregasDoPedido})`.mapWith(
      Number,
    ),
};

function where({ projetoId, situacao, busca, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(pedidoCompra.deletedAt),
    escopo ? inArray(pedidoCompra.projetoId, escopo) : undefined,
    projetoId ? eq(pedidoCompra.projetoId, projetoId) : undefined,
    situacao ? eq(pedidoCompra.situacao, situacao) : undefined,
    termo
      ? or(
          ilike(pedidoCompra.numero, termo),
          ilike(pedidoCompra.fornecedor, termo),
          ilike(pedidoCompra.descricao, termo),
        )
      : undefined,
  );
}

export default class PedidosCompraRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "createdAt"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    return tx
      .select(colunas)
      .from(pedidoCompra)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(pedidoCompra.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(pedidoCompra)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Pedido vivo e no escopo (`undefined` = sem filtro de projeto). */
  async porId(id: string, escopo: Escopo, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunas)
      .from(pedidoCompra)
      .where(
        and(
          eq(pedidoCompra.id, id),
          isNull(pedidoCompra.deletedAt),
          escopo ? inArray(pedidoCompra.projetoId, escopo) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  /** Número em uso por outro pedido vivo (o unique é parcial: `where deleted_at is null`). */
  async porNumero(numero: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: pedidoCompra.id })
      .from(pedidoCompra)
      .where(and(eq(pedidoCompra.numero, numero), isNull(pedidoCompra.deletedAt)))
      .limit(1);
    return row;
  }

  async inserir(data: NewPedidoCompra, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(pedidoCompra).values(data).returning({ id: pedidoCompra.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewPedidoCompra>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(pedidoCompra)
      .set(campos)
      .where(and(eq(pedidoCompra.id, id), isNull(pedidoCompra.deletedAt)))
      .returning({ id: pedidoCompra.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(pedidoCompra)
      .set({ deletedAt: new Date() })
      .where(and(eq(pedidoCompra.id, id), isNull(pedidoCompra.deletedAt)))
      .returning({ id: pedidoCompra.id });
    return row;
  }

  /** Entregas vivas ligadas ao pedido — impedem a exclusão. */
  async contarEntregas(id: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entrega)
      .where(and(eq(entrega.pedidoId, id), isNull(entrega.deletedAt)));
    return row?.total ?? 0;
  }
}
