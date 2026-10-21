import { and, asc, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import {
  opcaoDiagnostico,
  type NewOpcaoDiagnostico,
  type OpcaoDiagnostico,
} from "../../db/opcaoDiagnostico.ts";
import { diagnosticoOpcao } from "../../db/diagnosticoOpcao.ts";
import { evento } from "../../db/evento.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  nome: opcaoDiagnostico.nome,
  ordem: opcaoDiagnostico.ordem,
  grupo: opcaoDiagnostico.grupo,
  createdAt: opcaoDiagnostico.createdAt,
} as const;

type Grupo = OpcaoDiagnostico["grupo"];
type Filtros = { grupo?: Grupo; busca?: string; ativo?: boolean };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: opcaoDiagnostico.id,
  grupo: opcaoDiagnostico.grupo,
  nome: opcaoDiagnostico.nome,
  permiteDetalhe: opcaoDiagnostico.permiteDetalhe,
  ordem: opcaoDiagnostico.ordem,
  ativo: opcaoDiagnostico.ativo,
};

export type OpcaoDiagnosticoRow = Pick<OpcaoDiagnostico, keyof typeof colunas>;

function where({ grupo, busca, ativo }: Filtros) {
  return and(
    isNull(opcaoDiagnostico.deletedAt),
    grupo ? eq(opcaoDiagnostico.grupo, grupo) : undefined,
    busca ? ilike(opcaoDiagnostico.nome, `%${escaparLike(busca)}%`) : undefined,
    ativo !== undefined ? eq(opcaoDiagnostico.ativo, ativo) : undefined,
  );
}

export default class OpcoesDiagnosticoRepository {
  async listar(
    { limit, offset, sort, ...filtros }: ListParams,
    tx: DbOrTx = db,
  ): Promise<OpcaoDiagnosticoRow[]> {
    // Sem sort: como aparecem no questionário (grupo → ordem → nome)
    const ordenacao = sort
      ? [(sort.direcao === "desc" ? desc : asc)(SORT_COLUMNS[sort.campo]), asc(opcaoDiagnostico.id)]
      : [
          asc(opcaoDiagnostico.grupo),
          asc(opcaoDiagnostico.ordem),
          asc(opcaoDiagnostico.nome),
          asc(opcaoDiagnostico.id),
        ];
    return tx
      .select(colunas)
      .from(opcaoDiagnostico)
      .where(where(filtros))
      .orderBy(...ordenacao)
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(opcaoDiagnostico)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db): Promise<OpcaoDiagnosticoRow | undefined> {
    const [row] = await tx
      .select(colunas)
      .from(opcaoDiagnostico)
      .where(and(eq(opcaoDiagnostico.id, id), isNull(opcaoDiagnostico.deletedAt)))
      .limit(1);
    return row;
  }

  /** (grupo, nome sem diferenciar caixa) entre as não excluídas — o unique é parcial. */
  async porGrupoNome(
    grupo: Grupo,
    nome: string,
    excetoId?: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: opcaoDiagnostico.id })
      .from(opcaoDiagnostico)
      .where(
        and(
          eq(opcaoDiagnostico.grupo, grupo),
          sql`lower(${opcaoDiagnostico.nome}) = lower(${nome})`,
          isNull(opcaoDiagnostico.deletedAt),
          excetoId ? ne(opcaoDiagnostico.id, excetoId) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  async inserir(data: NewOpcaoDiagnostico, tx: DbOrTx = db): Promise<OpcaoDiagnosticoRow> {
    const [row] = await tx.insert(opcaoDiagnostico).values(data).returning(colunas);
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewOpcaoDiagnostico>,
    tx: DbOrTx = db,
  ): Promise<OpcaoDiagnosticoRow | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return this.porId(id, tx);
    const [row] = await tx
      .update(opcaoDiagnostico)
      .set(campos)
      .where(and(eq(opcaoDiagnostico.id, id), isNull(opcaoDiagnostico.deletedAt)))
      .returning(colunas);
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(opcaoDiagnostico)
      .set({ deletedAt: new Date() })
      .where(and(eq(opcaoDiagnostico.id, id), isNull(opcaoDiagnostico.deletedAt)))
      .returning({ id: opcaoDiagnostico.id });
    return row;
  }

  /** Usos não excluídos: marcações em diagnósticos + eventos com a opção como tema. */
  async contarUsos(id: string, tx: DbOrTx = db): Promise<number> {
    const [marcacoes, eventos] = await Promise.all([
      tx
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(diagnosticoOpcao)
        .where(and(eq(diagnosticoOpcao.opcaoId, id), isNull(diagnosticoOpcao.deletedAt))),
      tx
        .select({ total: sql<number>`cast(count(*) as int)` })
        .from(evento)
        .where(and(eq(evento.temaId, id), isNull(evento.deletedAt))),
    ]);
    return (marcacoes[0]?.total ?? 0) + (eventos[0]?.total ?? 0);
  }
}
