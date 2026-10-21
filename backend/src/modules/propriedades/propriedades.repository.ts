import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { propriedade, type NewPropriedade } from "../../db/propriedade.ts";
import { produtor } from "../../db/produtor.ts";
import { associacao } from "../../db/associacao.ts";
import { municipio } from "../../db/municipio.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";
import { associacaoNoEscopo } from "../projetos/projetos.repository.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  nome: propriedade.nome,
  produtorNome: user.name,
  createdAt: propriedade.createdAt,
} as const;

const colunas = {
  id: propriedade.id,
  produtorId: propriedade.produtorId,
  produtorNome: user.name,
  associacaoId: propriedade.associacaoId,
  associacaoSigla: associacao.sigla,
  nome: propriedade.nome,
  municipioId: propriedade.municipioId,
  municipioNome: municipio.nome,
  distrito: propriedade.distrito,
  endereco: propriedade.endereco,
  areaTotalHa: propriedade.areaTotalHa,
  areaProdutivaHa: propriedade.areaProdutivaHa,
  latitude: propriedade.latitude,
  longitude: propriedade.longitude,
  car: propriedade.car,
  ativo: propriedade.ativo,
};

type Filtros = {
  busca?: string;
  produtorId?: string;
  associacaoId?: string;
  municipioId?: number;
  ativo?: boolean;
  escopo: Escopo;
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

function where({ busca, produtorId, associacaoId, municipioId, ativo, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(propriedade.deletedAt),
    isNull(associacao.deletedAt),
    termo ? or(ilike(propriedade.nome, termo), ilike(user.name, termo)) : undefined,
    produtorId ? eq(propriedade.produtorId, produtorId) : undefined,
    associacaoId ? eq(propriedade.associacaoId, associacaoId) : undefined,
    municipioId ? eq(propriedade.municipioId, municipioId) : undefined,
    ativo !== undefined ? eq(propriedade.ativo, ativo) : undefined,
    // Dado compartilhado: segue a associação que atende a propriedade
    associacaoNoEscopo(escopo),
  );
}

/** FROM comum: propriedade + produtor (nome no user) + associação + município. */
const base = (tx: DbOrTx) =>
  tx
    .select(colunas)
    .from(propriedade)
    .innerJoin(produtor, eq(produtor.id, propriedade.produtorId))
    .innerJoin(user, eq(user.id, produtor.userId))
    .innerJoin(associacao, eq(associacao.id, propriedade.associacaoId))
    .innerJoin(municipio, eq(municipio.id, propriedade.municipioId));

export type PropriedadeResposta = Awaited<ReturnType<PropriedadesRepository["listar"]>>[number];

export default class PropriedadesRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "produtorNome"];
    const direcao = sort?.direcao === "desc" ? desc : asc;
    return base(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(propriedade.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(propriedade)
      .innerJoin(produtor, eq(produtor.id, propriedade.produtorId))
      .innerJoin(user, eq(user.id, produtor.userId))
      .innerJoin(associacao, eq(associacao.id, propriedade.associacaoId))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Por id (a visibilidade é garantida antes por `garantirPropriedade`). */
  async porId(id: string, tx: DbOrTx = db): Promise<PropriedadeResposta | undefined> {
    const [row] = await base(tx)
      .where(and(eq(propriedade.id, id), isNull(propriedade.deletedAt)))
      .limit(1);
    return row;
  }

  async municipioExiste(id: number, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx.select({ id: municipio.id }).from(municipio).where(eq(municipio.id, id)).limit(1);
    return Boolean(row);
  }

  async inserir(data: NewPropriedade, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(propriedade).values(data).returning({ id: propriedade.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewPropriedade>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(propriedade)
      .set(campos)
      .where(and(eq(propriedade.id, id), isNull(propriedade.deletedAt)))
      .returning({ id: propriedade.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(propriedade)
      .set({ deletedAt: new Date() })
      .where(and(eq(propriedade.id, id), isNull(propriedade.deletedAt)))
      .returning({ id: propriedade.id });
    return row;
  }

  /** Visitas e análises de solo vivas da propriedade — impedem a exclusão. */
  async contarDependencias(id: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .execute<{ total: string }>(
        sql`
      select
        (select count(*) from visitas where propriedade_id = ${id} and deleted_at is null)
      + (select count(*) from analises_solo where propriedade_id = ${id} and deleted_at is null)
        as total`,
      )
      .then((r) => r.rows);
    return Number(row?.total ?? 0);
  }
}
