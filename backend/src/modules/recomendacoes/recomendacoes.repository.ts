import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/index.ts";
import { recomendacao, type NewRecomendacao } from "../../db/recomendacao.ts";
import { visita } from "../../db/visita.ts";
import { propriedade } from "../../db/propriedade.ts";
import { produtor } from "../../db/produtor.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  prazo: recomendacao.prazo,
  situacao: recomendacao.situacao,
  createdAt: recomendacao.createdAt,
} as const;

type Filtros = {
  escopo?: Escopo;
  projetoId?: string;
  propriedadeId?: string;
  visitaId?: string;
  situacao?: (typeof recomendacao.situacao.enumValues)[number];
  categoria?: (typeof recomendacao.categoria.enumValues)[number];
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: recomendacao.id,
  visitaId: recomendacao.visitaId,
  visitaData: visita.data,
  projetoId: visita.projetoId,
  propriedadeId: recomendacao.propriedadeId,
  propriedadeNome: propriedade.nome,
  produtorNome: user.name,
  categoria: recomendacao.categoria,
  cultura: recomendacao.cultura,
  descricao: recomendacao.descricao,
  prazo: recomendacao.prazo,
  situacao: recomendacao.situacao,
  verificadaEmVisitaId: recomendacao.verificadaEmVisitaId,
};

/** A recomendação herda o projeto (e o escopo) da visita que a gerou. */
function where(f: Filtros) {
  return and(
    isNull(recomendacao.deletedAt),
    isNull(visita.deletedAt),
    f.escopo ? inArray(visita.projetoId, f.escopo) : undefined,
    f.projetoId ? eq(visita.projetoId, f.projetoId) : undefined,
    f.propriedadeId ? eq(recomendacao.propriedadeId, f.propriedadeId) : undefined,
    f.visitaId ? eq(recomendacao.visitaId, f.visitaId) : undefined,
    f.situacao ? eq(recomendacao.situacao, f.situacao) : undefined,
    f.categoria ? eq(recomendacao.categoria, f.categoria) : undefined,
  );
}

function consulta(tx: DbOrTx) {
  return tx
    .select(colunas)
    .from(recomendacao)
    .innerJoin(visita, eq(visita.id, recomendacao.visitaId))
    .innerJoin(propriedade, eq(propriedade.id, recomendacao.propriedadeId))
    .innerJoin(produtor, eq(produtor.id, propriedade.produtorId))
    .innerJoin(user, eq(user.id, produtor.userId));
}

export default class RecomendacoesRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "createdAt"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    return consulta(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(recomendacao.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(recomendacao)
      .innerJoin(visita, eq(visita.id, recomendacao.visitaId))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Recomendação viva cuja visita está no escopo (`undefined` = qualquer projeto). */
  async porId(id: string, escopo: Escopo, tx: DbOrTx = db) {
    const [row] = await consulta(tx)
      .where(and(eq(recomendacao.id, id), where({ escopo })))
      .limit(1);
    return row;
  }

  async inserir(data: NewRecomendacao, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(recomendacao).values(data).returning({ id: recomendacao.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewRecomendacao>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(recomendacao)
      .set(campos)
      .where(and(eq(recomendacao.id, id), isNull(recomendacao.deletedAt)))
      .returning({ id: recomendacao.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(recomendacao)
      .set({ deletedAt: new Date() })
      .where(and(eq(recomendacao.id, id), isNull(recomendacao.deletedAt)))
      .returning({ id: recomendacao.id });
    return row;
  }
}
