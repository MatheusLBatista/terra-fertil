import { and, asc, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { item, type Item, type NewItem } from "../../db/item.ts";
import { entrega } from "../../db/entrega.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  descricao: item.descricao,
  tipo: item.tipo,
  categoria: item.categoria,
  createdAt: item.createdAt,
} as const;

type Filtros = { busca?: string; tipo?: Item["tipo"]; categoria?: Item["categoria"]; ativo?: boolean };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: item.id,
  descricao: item.descricao,
  tipo: item.tipo,
  categoria: item.categoria,
  unidade: item.unidade,
  valorReferenciaCentavos: item.valorReferenciaCentavos,
  ativo: item.ativo,
};

export type ItemRow = Pick<Item, keyof typeof colunas>;

function where({ busca, tipo, categoria, ativo }: Filtros) {
  return and(
    isNull(item.deletedAt),
    busca ? ilike(item.descricao, `%${escaparLike(busca)}%`) : undefined,
    tipo ? eq(item.tipo, tipo) : undefined,
    categoria ? eq(item.categoria, categoria) : undefined,
    ativo !== undefined ? eq(item.ativo, ativo) : undefined,
  );
}

export default class ItensRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db): Promise<ItemRow[]> {
    const coluna = SORT_COLUMNS[sort?.campo ?? "descricao"];
    const direcao = sort?.direcao === "desc" ? desc : asc;
    return tx
      .select(colunas)
      .from(item)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(item.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(item)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db): Promise<ItemRow | undefined> {
    const [row] = await tx
      .select(colunas)
      .from(item)
      .where(and(eq(item.id, id), isNull(item.deletedAt)))
      .limit(1);
    return row;
  }

  /** Descrição sem diferenciar caixa entre os não excluídos (o unique é parcial). */
  async porDescricao(
    descricao: string,
    excetoId?: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: item.id })
      .from(item)
      .where(
        and(
          sql`lower(${item.descricao}) = lower(${descricao})`,
          isNull(item.deletedAt),
          excetoId ? ne(item.id, excetoId) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  async inserir(data: NewItem, tx: DbOrTx = db): Promise<ItemRow> {
    const [row] = await tx.insert(item).values(data).returning(colunas);
    return row;
  }

  async alterar(id: string, data: Partial<NewItem>, tx: DbOrTx = db): Promise<ItemRow | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return this.porId(id, tx);
    const [row] = await tx
      .update(item)
      .set(campos)
      .where(and(eq(item.id, id), isNull(item.deletedAt)))
      .returning(colunas);
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(item)
      .set({ deletedAt: new Date() })
      .where(and(eq(item.id, id), isNull(item.deletedAt)))
      .returning({ id: item.id });
    return row;
  }

  /** Entregas (não excluídas, de qualquer projeto) com o item. */
  async contarEntregas(id: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entrega)
      .where(and(eq(entrega.itemId, id), isNull(entrega.deletedAt)));
    return row?.total ?? 0;
  }
}
