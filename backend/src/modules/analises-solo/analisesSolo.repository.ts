import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { analiseSolo, type NewAnaliseSolo } from "../../db/analiseSolo.ts";
import { propriedade } from "../../db/propriedade.ts";
import { produtor } from "../../db/produtor.ts";
import { associacao } from "../../db/associacao.ts";
import { user } from "../../db/user.ts";
import { visita } from "../../db/visita.ts";
import { projetoAssociacao } from "../../db/projetoAssociacao.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";
import type { SITUACOES_ANALISE_SOLO } from "./analisesSolo.schema.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  identificadaEm: analiseSolo.identificadaEm,
  laudoRegistradoEm: analiseSolo.laudoRegistradoEm,
  createdAt: analiseSolo.createdAt,
} as const;

type Situacao = (typeof SITUACOES_ANALISE_SOLO)[number];

type Filtros = {
  projetoId?: string;
  propriedadeId?: string;
  associacaoId?: string;
  situacao?: Situacao;
  busca?: string;
  de?: string;
  ate?: string;
  escopo?: Escopo;
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: analiseSolo.id,
  projetoId: analiseSolo.projetoId,
  propriedadeId: analiseSolo.propriedadeId,
  propriedadeNome: propriedade.nome,
  produtorNome: user.name,
  associacaoId: associacao.id,
  associacaoSigla: associacao.sigla,
  visitaId: analiseSolo.visitaId,
  identificadaEm: analiseSolo.identificadaEm,
  observacao: analiseSolo.observacao,
  laudoUrl: analiseSolo.laudoUrl,
  laudoRegistradoEm: analiseSolo.laudoRegistradoEm,
};

type Row = { laudoUrl: string | null };
const comSituacao = <T extends Row>(r: T) => ({
  ...r,
  situacao: (r.laudoUrl ? "com_laudo" : "pendente") as Situacao,
});

/** FROM analises_solo + propriedade + produtor (nome no user) + associação que atende a propriedade. */
function base(tx: DbOrTx) {
  return tx
    .select(colunas)
    .from(analiseSolo)
    .innerJoin(propriedade, eq(propriedade.id, analiseSolo.propriedadeId))
    .innerJoin(produtor, eq(produtor.id, propriedade.produtorId))
    .innerJoin(user, eq(user.id, produtor.userId))
    .innerJoin(associacao, eq(associacao.id, propriedade.associacaoId));
}

function where({ projetoId, propriedadeId, associacaoId, situacao, busca, de, ate, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(analiseSolo.deletedAt),
    escopo ? inArray(analiseSolo.projetoId, escopo) : undefined,
    projetoId ? eq(analiseSolo.projetoId, projetoId) : undefined,
    propriedadeId ? eq(analiseSolo.propriedadeId, propriedadeId) : undefined,
    associacaoId ? eq(propriedade.associacaoId, associacaoId) : undefined,
    situacao === "pendente" ? isNull(analiseSolo.laudoUrl) : undefined,
    situacao === "com_laudo" ? isNotNull(analiseSolo.laudoUrl) : undefined,
    termo ? or(ilike(propriedade.nome, termo), ilike(user.name, termo)) : undefined,
    // `identificada_em` é date: comparação direta com a string YYYY-MM-DD (ambos inclusivos)
    de ? gte(analiseSolo.identificadaEm, de) : undefined,
    ate ? lte(analiseSolo.identificadaEm, ate) : undefined,
  );
}

export default class AnalisesSoloRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "identificadaEm"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    const rows = await base(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(analiseSolo.id))
      .limit(limit)
      .offset(offset);
    return rows.map(comSituacao);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(analiseSolo)
      .innerJoin(propriedade, eq(propriedade.id, analiseSolo.propriedadeId))
      .innerJoin(produtor, eq(produtor.id, propriedade.produtorId))
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Registro vivo e no escopo (`undefined` = sem filtro de projeto). */
  async porId(id: string, escopo: Escopo, tx: DbOrTx = db) {
    const [row] = await base(tx)
      .where(
        and(
          eq(analiseSolo.id, id),
          isNull(analiseSolo.deletedAt),
          escopo ? inArray(analiseSolo.projetoId, escopo) : undefined,
        ),
      )
      .limit(1);
    return row ? comSituacao(row) : undefined;
  }

  /** Id já usado (inclusive excluído) — o id pode vir do app offline. */
  async idExiste(id: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: analiseSolo.id })
      .from(analiseSolo)
      .where(eq(analiseSolo.id, id))
      .limit(1);
    return Boolean(row);
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

  async visitaPorId(
    visitaId: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string; projetoId: string; propriedadeId: string | null } | undefined> {
    const [row] = await tx
      .select({ id: visita.id, projetoId: visita.projetoId, propriedadeId: visita.propriedadeId })
      .from(visita)
      .where(and(eq(visita.id, visitaId), isNull(visita.deletedAt)))
      .limit(1);
    return row;
  }

  async inserir(data: NewAnaliseSolo, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(analiseSolo).values(data).returning({ id: analiseSolo.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewAnaliseSolo>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(analiseSolo)
      .set(campos)
      .where(and(eq(analiseSolo.id, id), isNull(analiseSolo.deletedAt)))
      .returning({ id: analiseSolo.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(analiseSolo)
      .set({ deletedAt: new Date() })
      .where(and(eq(analiseSolo.id, id), isNull(analiseSolo.deletedAt)))
      .returning({ id: analiseSolo.id });
    return row;
  }
}
