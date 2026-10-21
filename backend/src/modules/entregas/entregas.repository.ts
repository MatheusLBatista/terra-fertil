import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { entrega, type NewEntrega } from "../../db/entrega.ts";
import { associacao } from "../../db/associacao.ts";
import { item } from "../../db/item.ts";
import { pedidoCompra } from "../../db/pedidoCompra.ts";
import { projetoAssociacao } from "../../db/projetoAssociacao.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  situacao: entrega.situacao,
  dataPrevista: entrega.dataPrevista,
  dataEntrega: entrega.dataEntrega,
  createdAt: entrega.createdAt,
} as const;

type Filtros = {
  projetoId?: string;
  associacaoId?: string;
  itemId?: string;
  pedidoId?: string;
  situacao?: (typeof entrega.situacao.enumValues)[number];
  lote?: string;
  busca?: string;
  escopo?: Escopo;
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

// A key do termo de uso nunca sai na API — só o booleano
const colunas = {
  id: entrega.id,
  projetoId: entrega.projetoId,
  associacaoId: entrega.associacaoId,
  associacaoSigla: associacao.sigla,
  itemId: entrega.itemId,
  itemDescricao: item.descricao,
  pedidoId: entrega.pedidoId,
  pedidoNumero: pedidoCompra.numero,
  lote: entrega.lote,
  quantidade: entrega.quantidade,
  valorEstimadoCentavos: entrega.valorEstimadoCentavos,
  valorConsolidadoCentavos: entrega.valorConsolidadoCentavos,
  situacao: entrega.situacao,
  dataPrevista: entrega.dataPrevista,
  dataEntrega: entrega.dataEntrega,
  numeroSerie: entrega.numeroSerie,
  observacao: entrega.observacao,
  temTermoUso: sql<boolean>`${entrega.termoUsoKey} is not null`,
};

function base(tx: DbOrTx) {
  return tx
    .select(colunas)
    .from(entrega)
    .innerJoin(associacao, eq(associacao.id, entrega.associacaoId))
    .innerJoin(item, eq(item.id, entrega.itemId))
    .leftJoin(pedidoCompra, eq(pedidoCompra.id, entrega.pedidoId));
}

function where({ projetoId, associacaoId, itemId, pedidoId, situacao, lote, busca, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(entrega.deletedAt),
    escopo ? inArray(entrega.projetoId, escopo) : undefined,
    projetoId ? eq(entrega.projetoId, projetoId) : undefined,
    associacaoId ? eq(entrega.associacaoId, associacaoId) : undefined,
    itemId ? eq(entrega.itemId, itemId) : undefined,
    pedidoId ? eq(entrega.pedidoId, pedidoId) : undefined,
    situacao ? eq(entrega.situacao, situacao) : undefined,
    lote ? ilike(entrega.lote, `%${escaparLike(lote)}%`) : undefined,
    termo ? or(ilike(associacao.sigla, termo), ilike(item.descricao, termo)) : undefined,
  );
}

export default class EntregasRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "createdAt"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    return base(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(entrega.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entrega)
      .innerJoin(associacao, eq(associacao.id, entrega.associacaoId))
      .innerJoin(item, eq(item.id, entrega.itemId))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Entrega viva e no escopo (`undefined` = sem filtro de projeto). */
  async porId(id: string, escopo: Escopo, tx: DbOrTx = db) {
    const [row] = await base(tx)
      .where(
        and(
          eq(entrega.id, id),
          isNull(entrega.deletedAt),
          escopo ? inArray(entrega.projetoId, escopo) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  /** Key do termo de uso no storage (uso interno — não vai para a resposta). */
  async chaveTermoUso(id: string, tx: DbOrTx = db): Promise<string | null> {
    const [row] = await tx
      .select({ key: entrega.termoUsoKey })
      .from(entrega)
      .where(and(eq(entrega.id, id), isNull(entrega.deletedAt)))
      .limit(1);
    return row?.key ?? null;
  }

  /** A associação tem adesão ATIVA (viva e `ativo`) ao projeto. */
  async adesaoAtiva(projetoId: string, associacaoId: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: projetoAssociacao.id })
      .from(projetoAssociacao)
      .where(
        and(
          eq(projetoAssociacao.projetoId, projetoId),
          eq(projetoAssociacao.associacaoId, associacaoId),
          eq(projetoAssociacao.ativo, true),
          isNull(projetoAssociacao.deletedAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async itemPorId(
    itemId: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string; descricao: string; ativo: boolean } | undefined> {
    const [row] = await tx
      .select({ id: item.id, descricao: item.descricao, ativo: item.ativo })
      .from(item)
      .where(and(eq(item.id, itemId), isNull(item.deletedAt)))
      .limit(1);
    return row;
  }

  async pedidoPorId(
    pedidoId: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string; projetoId: string; numero: string } | undefined> {
    const [row] = await tx
      .select({ id: pedidoCompra.id, projetoId: pedidoCompra.projetoId, numero: pedidoCompra.numero })
      .from(pedidoCompra)
      .where(and(eq(pedidoCompra.id, pedidoId), isNull(pedidoCompra.deletedAt)))
      .limit(1);
    return row;
  }

  async inserir(data: NewEntrega, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(entrega).values(data).returning({ id: entrega.id });
    return row;
  }

  async alterar(id: string, data: Partial<NewEntrega>, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(entrega)
      .set(campos)
      .where(and(eq(entrega.id, id), isNull(entrega.deletedAt)))
      .returning({ id: entrega.id });
    return row;
  }

  /** Grava (ou limpa, com `null`) a key do termo de uso. */
  async definirTermoUso(id: string, key: string | null, tx: DbOrTx = db) {
    const [row] = await tx
      .update(entrega)
      .set({ termoUsoKey: key })
      .where(and(eq(entrega.id, id), isNull(entrega.deletedAt)))
      .returning({ id: entrega.id });
    return row as { id: string } | undefined;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(entrega)
      .set({ deletedAt: new Date() })
      .where(and(eq(entrega.id, id), isNull(entrega.deletedAt)))
      .returning({ id: entrega.id });
    return row;
  }
}
