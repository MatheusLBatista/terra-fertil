import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { lancamentoFinanceiro, type NewLancamentoFinanceiro } from "../../db/lancamentoFinanceiro.ts";
import { meta } from "../../db/meta.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

const l = lancamentoFinanceiro;

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  data: l.data,
  valorCentavos: l.valorCentavos,
  createdAt: l.createdAt,
} as const;

type Tipo = (typeof l.tipo.enumValues)[number];

export type Filtros = {
  projetoId?: string;
  tipo?: Tipo;
  metaId?: string;
  de?: string;
  ate?: string;
  busca?: string;
  escopo?: Escopo;
};

type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: l.id,
  projetoId: l.projetoId,
  metaId: l.metaId,
  metaNumero: meta.numero,
  tipo: l.tipo,
  descricao: l.descricao,
  valorCentavos: l.valorCentavos,
  data: l.data,
  documentoRef: l.documentoRef,
  createdAt: l.createdAt,
};

function where({ projetoId, tipo, metaId, de, ate, busca, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(l.deletedAt),
    projetoId ? eq(l.projetoId, projetoId) : undefined,
    escopo ? (escopo.length ? inArray(l.projetoId, escopo) : sql`false`) : undefined,
    tipo ? eq(l.tipo, tipo) : undefined,
    metaId ? eq(l.metaId, metaId) : undefined,
    // `data` é date: comparação direta com YYYY-MM-DD, intervalo fechado
    de ? gte(l.data, de) : undefined,
    ate ? lte(l.data, ate) : undefined,
    termo ? or(ilike(l.descricao, termo), ilike(l.documentoRef, termo)) : undefined,
  );
}

export default class LancamentosRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "data"];
    const direcao = sort?.direcao === "asc" ? asc : desc;
    return tx
      .select(colunas)
      .from(l)
      .leftJoin(meta, eq(meta.id, l.metaId))
      .where(where(filtros))
      .orderBy(direcao(coluna), desc(l.createdAt), asc(l.id))
      .limit(limit)
      .offset(offset);
  }

  /** Total de linhas e Σ por tipo do MESMO filtro (ignora a paginação). */
  async totais(filtros: Filtros, tx: DbOrTx = db) {
    const somar = (tipo: Tipo) =>
      sql<string>`coalesce(sum(${l.valorCentavos}) filter (where ${eq(l.tipo, tipo)}), 0)::text`;
    const [row] = await tx
      .select({
        total: sql<number>`cast(count(*) as int)`,
        liberado: somar("liberacao"),
        despesa: somar("despesa"),
      })
      .from(l)
      .where(where(filtros));
    return {
      total: row?.total ?? 0,
      liberadoCentavos: Number(row?.liberado ?? 0),
      despesaCentavos: Number(row?.despesa ?? 0),
    };
  }

  async porId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunas)
      .from(l)
      .leftJoin(meta, eq(meta.id, l.metaId))
      .where(and(eq(l.id, id), isNull(l.deletedAt)))
      .limit(1);
    return row;
  }

  /** Projeto da meta viva (para conferir que é o mesmo do lançamento). */
  async projetoDaMeta(metaId: string, tx: DbOrTx = db): Promise<string | undefined> {
    const [row] = await tx
      .select({ projetoId: meta.projetoId })
      .from(meta)
      .where(and(eq(meta.id, metaId), isNull(meta.deletedAt)))
      .limit(1);
    return row?.projetoId;
  }

  async inserir(data: NewLancamentoFinanceiro, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(l).values(data).returning({ id: l.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewLancamentoFinanceiro>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(l)
      .set(campos)
      .where(and(eq(l.id, id), isNull(l.deletedAt)))
      .returning({ id: l.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(l)
      .set({ deletedAt: new Date() })
      .where(and(eq(l.id, id), isNull(l.deletedAt)))
      .returning({ id: l.id });
    return row;
  }
}
