import { and, asc, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { tipoDocumento, type NewTipoDocumento, type TipoDocumento } from "../../db/tipoDocumento.ts";
import { associacaoDocumento } from "../../db/associacaoDocumento.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  nome: tipoDocumento.nome,
  ordem: tipoDocumento.ordem,
  createdAt: tipoDocumento.createdAt,
} as const;

type Filtros = { busca?: string; ativo?: boolean };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: tipoDocumento.id,
  nome: tipoDocumento.nome,
  obrigatorio: tipoDocumento.obrigatorio,
  porProjeto: tipoDocumento.porProjeto,
  ordem: tipoDocumento.ordem,
  ativo: tipoDocumento.ativo,
};

export type TipoDocumentoRow = Pick<TipoDocumento, keyof typeof colunas>;

function where({ busca, ativo }: Filtros) {
  return and(
    isNull(tipoDocumento.deletedAt),
    busca ? ilike(tipoDocumento.nome, `%${escaparLike(busca)}%`) : undefined,
    ativo !== undefined ? eq(tipoDocumento.ativo, ativo) : undefined,
  );
}

export default class TiposDocumentoRepository {
  async listar(
    { limit, offset, sort, ...filtros }: ListParams,
    tx: DbOrTx = db,
  ): Promise<TipoDocumentoRow[]> {
    // Sem sort: a ordem do checklist (ordem → nome)
    const ordenacao = sort
      ? [(sort.direcao === "desc" ? desc : asc)(SORT_COLUMNS[sort.campo]), asc(tipoDocumento.id)]
      : [asc(tipoDocumento.ordem), asc(tipoDocumento.nome), asc(tipoDocumento.id)];
    return tx
      .select(colunas)
      .from(tipoDocumento)
      .where(where(filtros))
      .orderBy(...ordenacao)
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(tipoDocumento)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db): Promise<TipoDocumentoRow | undefined> {
    const [row] = await tx
      .select(colunas)
      .from(tipoDocumento)
      .where(and(eq(tipoDocumento.id, id), isNull(tipoDocumento.deletedAt)))
      .limit(1);
    return row;
  }

  /** Nome sem diferenciar caixa entre os não excluídos (o unique é parcial). */
  async porNome(nome: string, excetoId?: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: tipoDocumento.id })
      .from(tipoDocumento)
      .where(
        and(
          sql`lower(${tipoDocumento.nome}) = lower(${nome})`,
          isNull(tipoDocumento.deletedAt),
          excetoId ? ne(tipoDocumento.id, excetoId) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  async inserir(data: NewTipoDocumento, tx: DbOrTx = db): Promise<TipoDocumentoRow> {
    const [row] = await tx.insert(tipoDocumento).values(data).returning(colunas);
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewTipoDocumento>,
    tx: DbOrTx = db,
  ): Promise<TipoDocumentoRow | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return this.porId(id, tx);
    const [row] = await tx
      .update(tipoDocumento)
      .set(campos)
      .where(and(eq(tipoDocumento.id, id), isNull(tipoDocumento.deletedAt)))
      .returning(colunas);
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(tipoDocumento)
      .set({ deletedAt: new Date() })
      .where(and(eq(tipoDocumento.id, id), isNull(tipoDocumento.deletedAt)))
      .returning({ id: tipoDocumento.id });
    return row;
  }

  /** Documentos entregues (não excluídos) deste tipo. */
  async contarDocumentos(id: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(associacaoDocumento)
      .where(and(eq(associacaoDocumento.tipoDocumentoId, id), isNull(associacaoDocumento.deletedAt)));
    return row?.total ?? 0;
  }
}
