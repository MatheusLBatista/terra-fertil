import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { papel, type Papel } from "../../db/papel.ts";
import { permissao, type Permissao } from "../../db/permissao.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

export type PermissaoDoPapel = Pick<Permissao, "acao" | "subject">;
export type PapelResumo = Pick<Papel, "id" | "nome" | "descricao">;

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  nome: papel.nome,
  createdAt: papel.createdAt,
} as const;

type Filtros = { nome?: string };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = { id: papel.id, nome: papel.nome, descricao: papel.descricao };

function where(filters: Filtros) {
  return and(
    isNull(papel.deletedAt),
    filters.nome ? ilike(papel.nome, `%${escaparLike(filters.nome)}%`) : undefined,
  );
}

export default class PapeisRepository {
  async listar({ limit, offset, sort, ...filters }: ListParams, tx: DbOrTx = db): Promise<PapelResumo[]> {
    const coluna = SORT_COLUMNS[sort?.campo ?? "nome"];
    const direcao = sort?.direcao === "desc" ? desc : asc;
    return tx
      .select(colunas)
      .from(papel)
      .where(where(filters))
      .orderBy(direcao(coluna), asc(papel.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filters: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(papel)
      .where(where(filters));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db): Promise<PapelResumo | undefined> {
    const [row] = await tx
      .select(colunas)
      .from(papel)
      .where(and(eq(papel.id, id), isNull(papel.deletedAt)))
      .limit(1);
    return row;
  }

  /** Por id SEM filtrar soft delete — para reativar. */
  async porIdIncluindoExcluidos(
    id: string,
    tx: DbOrTx = db,
  ): Promise<(PapelResumo & { deletedAt: Date | null }) | undefined> {
    const [row] = await tx
      .select({ ...colunas, deletedAt: papel.deletedAt })
      .from(papel)
      .where(eq(papel.id, id))
      .limit(1);
    return row;
  }

  /** Busca por nome SEM filtrar soft delete: `nome` tem unique total (FK de user.role). */
  async porNomeIncluindoExcluidos(
    nome: string,
    tx: DbOrTx = db,
  ): Promise<(PapelResumo & { deletedAt: Date | null }) | undefined> {
    const [row] = await tx
      .select({ ...colunas, deletedAt: papel.deletedAt })
      .from(papel)
      .where(eq(papel.nome, nome))
      .limit(1);
    return row;
  }

  async inserir(data: { nome: string; descricao?: string }, tx: DbOrTx = db): Promise<PapelResumo> {
    const [row] = await tx.insert(papel).values(data).returning(colunas);
    return row;
  }

  async alterar(
    id: string,
    data: { nome?: string; descricao?: string | null },
    tx: DbOrTx = db,
  ): Promise<PapelResumo | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return this.porId(id, tx);
    const [row] = await tx
      .update(papel)
      .set(campos)
      .where(and(eq(papel.id, id), isNull(papel.deletedAt)))
      .returning(colunas);
    return row;
  }

  /** Soft delete — a linha permanece para auditoria e para o unique total do nome. */
  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(papel)
      .set({ deletedAt: new Date() })
      .where(and(eq(papel.id, id), isNull(papel.deletedAt)))
      .returning({ id: papel.id });
    return row;
  }

  /** Desfaz o soft delete — as permissões não são tocadas pelo excluir, então voltam como estavam. */
  async reativar(id: string, tx: DbOrTx = db): Promise<PapelResumo | undefined> {
    const [row] = await tx.update(papel).set({ deletedAt: null }).where(eq(papel.id, id)).returning(colunas);
    return row;
  }

  async listarPermissoes(papelId: string, tx: DbOrTx = db): Promise<PermissaoDoPapel[]> {
    return tx
      .select({ acao: permissao.acao, subject: permissao.subject })
      .from(permissao)
      .where(and(eq(permissao.papelId, papelId), isNull(permissao.deletedAt)))
      .orderBy(asc(permissao.subject), asc(permissao.acao));
  }

  /** Permissões de vários papéis numa query só (para a listagem com ?incluir=permissoes). */
  async listarPermissoesDePapeis(
    papelIds: string[],
    tx: DbOrTx = db,
  ): Promise<Map<string, PermissaoDoPapel[]>> {
    const mapa = new Map<string, PermissaoDoPapel[]>(papelIds.map((id) => [id, []]));
    if (papelIds.length === 0) return mapa;
    const rows = await tx
      .select({ papelId: permissao.papelId, acao: permissao.acao, subject: permissao.subject })
      .from(permissao)
      .where(and(inArray(permissao.papelId, papelIds), isNull(permissao.deletedAt)))
      .orderBy(asc(permissao.subject), asc(permissao.acao));
    for (const { papelId, ...p } of rows) mapa.get(papelId)?.push(p);
    return mapa;
  }

  async inserirPermissoes(papelId: string, permissoes: PermissaoDoPapel[], tx: DbOrTx = db): Promise<void> {
    if (permissoes.length === 0) return;
    await tx.insert(permissao).values(permissoes.map((p) => ({ papelId, ...p })));
  }

  /** Substituição do conjunto: soft-deleta as atuais e insere as novas (auditável). */
  async substituirPermissoes(
    papelId: string,
    permissoes: PermissaoDoPapel[],
    tx: DbOrTx = db,
  ): Promise<void> {
    await tx
      .update(permissao)
      .set({ deletedAt: new Date() })
      .where(and(eq(permissao.papelId, papelId), isNull(permissao.deletedAt)));
    await this.inserirPermissoes(papelId, permissoes, tx);
  }

  async contarUsuariosComPapel(nome: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(user)
      .where(eq(user.role, nome));
    return row?.total ?? 0;
  }

  /** Permissões (acao, subject) pelo NOME do papel — alimenta o defineAbilityFor do CASL. */
  async listarPermissoesPorPapel(nomePapel: string, tx: DbOrTx = db): Promise<PermissaoDoPapel[]> {
    return tx
      .select({ acao: permissao.acao, subject: permissao.subject })
      .from(permissao)
      .innerJoin(papel, eq(permissao.papelId, papel.id))
      .where(and(eq(papel.nome, nomePapel), isNull(papel.deletedAt), isNull(permissao.deletedAt)));
  }
}
