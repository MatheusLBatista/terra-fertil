import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { projeto, type NewProjeto } from "../../db/projeto.ts";
import { projetoEquipe, type NewProjetoEquipe } from "../../db/projetoEquipe.ts";
import { projetoAssociacao, type NewProjetoAssociacao } from "../../db/projetoAssociacao.ts";
import { associacao } from "../../db/associacao.ts";
import { municipio } from "../../db/municipio.ts";
import { papel } from "../../db/papel.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import { ehEmailTecnico } from "../../lib/documentos.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlists de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  sigla: projeto.sigla,
  nome: projeto.nome,
  inicio: projeto.inicio,
  fim: projeto.fim,
  createdAt: projeto.createdAt,
} as const;

const SORT_ADESOES = {
  sigla: associacao.sigla,
  aderiuEm: projetoAssociacao.aderiuEm,
  createdAt: projetoAssociacao.createdAt,
} as const;

type Filtros = { busca?: string; situacao?: (typeof projeto.situacao.enumValues)[number]; escopo?: Escopo };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: projeto.id,
  sigla: projeto.sigla,
  nome: projeto.nome,
  numeroInstrumento: projeto.numeroInstrumento,
  concedente: projeto.concedente,
  executor: projeto.executor,
  inicio: projeto.inicio,
  fim: projeto.fim,
  valorTotalCentavos: projeto.valorTotalCentavos,
  situacao: projeto.situacao,
};

const colunasMembro = {
  id: projetoEquipe.id,
  projetoId: projetoEquipe.projetoId,
  userId: projetoEquipe.userId,
  nome: user.name,
  email: user.email,
  telefone: user.phoneNumber,
  tipo: projetoEquipe.tipo,
  funcao: projetoEquipe.funcao,
  instituicao: projetoEquipe.instituicao,
  curso: projetoEquipe.curso,
  contratadoEm: projetoEquipe.contratadoEm,
  desligadoEm: projetoEquipe.desligadoEm,
};

const colunasAdesao = {
  id: projetoAssociacao.id,
  projetoId: projetoAssociacao.projetoId,
  associacaoId: projetoAssociacao.associacaoId,
  sigla: associacao.sigla,
  nome: associacao.nome,
  municipio: municipio.nome,
  aderiuEm: projetoAssociacao.aderiuEm,
  interesseDeclarado: projetoAssociacao.interesseDeclarado,
  demandaInicial: projetoAssociacao.demandaInicial,
  valorSugeridoCentavos: projetoAssociacao.valorSugeridoCentavos,
  parceriaFormalizadaEm: projetoAssociacao.parceriaFormalizadaEm,
  ativo: projetoAssociacao.ativo,
};

type MembroRow = Awaited<ReturnType<ProjetosRepository["listarEquipe"]>>[number];
const semEmailTecnico = <T extends { email: string | null }>(m: T): T => ({
  ...m,
  email: m.email && ehEmailTecnico(m.email) ? null : m.email,
});

function where({ busca, situacao, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(projeto.deletedAt),
    termo ? or(ilike(projeto.sigla, termo), ilike(projeto.nome, termo)) : undefined,
    situacao ? eq(projeto.situacao, situacao) : undefined,
    escopo ? inArray(projeto.id, escopo) : undefined,
  );
}

export default class ProjetosRepository {
  // ─── Escopo (lido por src/lib/escopo.ts) ──────────────────────────────────

  async papelVeTodosOsProjetos(nomePapel: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ todos: papel.acessoTodosProjetos })
      .from(papel)
      .where(and(eq(papel.nome, nomePapel), isNull(papel.deletedAt)))
      .limit(1);
    return row?.todos ?? false;
  }

  /** Projetos em que a pessoa está na equipe e não foi desligada. */
  async projetosDaEquipe(userId: string, tx: DbOrTx = db): Promise<string[]> {
    const rows = await tx
      .select({ id: projetoEquipe.projetoId })
      .from(projetoEquipe)
      .innerJoin(projeto, eq(projeto.id, projetoEquipe.projetoId))
      .where(
        and(
          eq(projetoEquipe.userId, userId),
          isNull(projetoEquipe.deletedAt),
          isNull(projeto.deletedAt),
          or(isNull(projetoEquipe.desligadoEm), gte(projetoEquipe.desligadoEm, sql`current_date`)),
        ),
      );
    return rows.map((r) => r.id);
  }

  // ─── Projetos ─────────────────────────────────────────────────────────────

  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "inicio"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    return tx
      .select(colunas)
      .from(projeto)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(projeto.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(projeto)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunas)
      .from(projeto)
      .where(and(eq(projeto.id, id), isNull(projeto.deletedAt)))
      .limit(1);
    return row;
  }

  async porSigla(sigla: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: projeto.id })
      .from(projeto)
      .where(and(sql`lower(${projeto.sigla}) = lower(${sigla})`, isNull(projeto.deletedAt)))
      .limit(1);
    return row;
  }

  async inserir(data: NewProjeto, tx: DbOrTx = db) {
    const [row] = await tx.insert(projeto).values(data).returning(colunas);
    return row;
  }

  async alterar(id: string, data: Partial<NewProjeto>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return this.porId(id, tx);
    const [row] = await tx
      .update(projeto)
      .set(campos)
      .where(and(eq(projeto.id, id), isNull(projeto.deletedAt)))
      .returning(colunas);
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(projeto)
      .set({ deletedAt: new Date() })
      .where(and(eq(projeto.id, id), isNull(projeto.deletedAt)))
      .returning({ id: projeto.id });
    return row;
  }

  /** Registros vivos que pertencem ao projeto — impedem a exclusão. */
  async contarDependencias(id: string, tx: DbOrTx = db): Promise<number> {
    const tabelas = [
      "metas",
      "projeto_equipe",
      "projeto_associacoes",
      "visitas",
      "analises_solo",
      "pedidos_compra",
      "entregas",
      "eventos",
      "producoes",
      "lancamentos_financeiros",
    ];
    // Nomes fixos acima (não vêm do usuário) — sql.identifier evita qualquer interpolação crua
    const partes = tabelas.map(
      (t) => sql`(select count(*) from ${sql.identifier(t)} where projeto_id = ${id} and deleted_at is null)`,
    );
    const [row] = await tx
      .execute<{ total: string }>(sql`select ${sql.join(partes, sql` + `)} as total`)
      .then((r) => r.rows);
    return Number(row?.total ?? 0);
  }

  // ─── Equipe ───────────────────────────────────────────────────────────────

  async listarEquipe(projetoId: string, tx: DbOrTx = db) {
    const rows = await tx
      .select(colunasMembro)
      .from(projetoEquipe)
      .innerJoin(user, eq(user.id, projetoEquipe.userId))
      .where(and(eq(projetoEquipe.projetoId, projetoId), isNull(projetoEquipe.deletedAt)))
      .orderBy(asc(projetoEquipe.tipo), asc(user.name), asc(projetoEquipe.id));
    return rows.map(semEmailTecnico);
  }

  async membroPorId(projetoId: string, membroId: string, tx: DbOrTx = db): Promise<MembroRow | undefined> {
    const [row] = await tx
      .select(colunasMembro)
      .from(projetoEquipe)
      .innerJoin(user, eq(user.id, projetoEquipe.userId))
      .where(
        and(
          eq(projetoEquipe.id, membroId),
          eq(projetoEquipe.projetoId, projetoId),
          isNull(projetoEquipe.deletedAt),
        ),
      )
      .limit(1);
    return row ? semEmailTecnico(row) : undefined;
  }

  async membroPorUsuario(
    projetoId: string,
    userId: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: projetoEquipe.id })
      .from(projetoEquipe)
      .where(
        and(
          eq(projetoEquipe.projetoId, projetoId),
          eq(projetoEquipe.userId, userId),
          isNull(projetoEquipe.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async inserirMembro(data: NewProjetoEquipe, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(projetoEquipe).values(data).returning({ id: projetoEquipe.id });
    return row;
  }

  async alterarMembro(membroId: string, data: Partial<NewProjetoEquipe>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id: membroId };
    const [row] = await tx
      .update(projetoEquipe)
      .set(campos)
      .where(and(eq(projetoEquipe.id, membroId), isNull(projetoEquipe.deletedAt)))
      .returning({ id: projetoEquipe.id });
    return row;
  }

  async excluirMembro(membroId: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(projetoEquipe)
      .set({ deletedAt: new Date() })
      .where(and(eq(projetoEquipe.id, membroId), isNull(projetoEquipe.deletedAt)))
      .returning({ id: projetoEquipe.id });
    return row;
  }

  // ─── Adesões ──────────────────────────────────────────────────────────────

  private whereAdesoes(projetoId: string, busca?: string) {
    const termo = busca ? `%${escaparLike(busca)}%` : undefined;
    return and(
      eq(projetoAssociacao.projetoId, projetoId),
      isNull(projetoAssociacao.deletedAt),
      isNull(associacao.deletedAt),
      termo ? or(ilike(associacao.sigla, termo), ilike(associacao.nome, termo)) : undefined,
    );
  }

  async listarAdesoes(
    projetoId: string,
    {
      busca,
      limit,
      offset,
      sort,
    }: { busca?: string; limit: number; offset: number; sort?: Sort<keyof typeof SORT_ADESOES & string> },
    tx: DbOrTx = db,
  ) {
    const coluna = SORT_ADESOES[sort?.campo ?? "sigla"];
    const direcao = sort?.direcao === "desc" ? desc : asc;
    return tx
      .select(colunasAdesao)
      .from(projetoAssociacao)
      .innerJoin(associacao, eq(associacao.id, projetoAssociacao.associacaoId))
      .innerJoin(municipio, eq(municipio.id, associacao.municipioId))
      .where(this.whereAdesoes(projetoId, busca))
      .orderBy(direcao(coluna), asc(projetoAssociacao.id))
      .limit(limit)
      .offset(offset);
  }

  async contarAdesoes(projetoId: string, busca?: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(projetoAssociacao)
      .innerJoin(associacao, eq(associacao.id, projetoAssociacao.associacaoId))
      .where(this.whereAdesoes(projetoId, busca));
    return row?.total ?? 0;
  }

  async adesaoPorId(projetoId: string, adesaoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunasAdesao)
      .from(projetoAssociacao)
      .innerJoin(associacao, eq(associacao.id, projetoAssociacao.associacaoId))
      .innerJoin(municipio, eq(municipio.id, associacao.municipioId))
      .where(
        and(
          eq(projetoAssociacao.id, adesaoId),
          eq(projetoAssociacao.projetoId, projetoId),
          isNull(projetoAssociacao.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async adesaoPorAssociacao(projetoId: string, associacaoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: projetoAssociacao.id })
      .from(projetoAssociacao)
      .where(
        and(
          eq(projetoAssociacao.projetoId, projetoId),
          eq(projetoAssociacao.associacaoId, associacaoId),
          isNull(projetoAssociacao.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async associacaoExiste(associacaoId: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: associacao.id })
      .from(associacao)
      .where(and(eq(associacao.id, associacaoId), isNull(associacao.deletedAt)))
      .limit(1);
    return Boolean(row);
  }

  async inserirAdesao(data: NewProjetoAssociacao, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(projetoAssociacao).values(data).returning({ id: projetoAssociacao.id });
    return row;
  }

  async alterarAdesao(adesaoId: string, data: Partial<NewProjetoAssociacao>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id: adesaoId };
    const [row] = await tx
      .update(projetoAssociacao)
      .set(campos)
      .where(and(eq(projetoAssociacao.id, adesaoId), isNull(projetoAssociacao.deletedAt)))
      .returning({ id: projetoAssociacao.id });
    return row;
  }

  async excluirAdesao(adesaoId: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(projetoAssociacao)
      .set({ deletedAt: new Date() })
      .where(and(eq(projetoAssociacao.id, adesaoId), isNull(projetoAssociacao.deletedAt)))
      .returning({ id: projetoAssociacao.id });
    return row;
  }

  /** Registros da associação neste projeto — impedem desfazer a adesão. */
  async contarRegistrosDaAssociacaoNoProjeto(projetoId: string, associacaoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .execute<{ total: string }>(
        sql`
      select
        (select count(*) from visitas v
           left join propriedades p on p.id = v.propriedade_id
          where v.projeto_id = ${projetoId} and v.deleted_at is null
            and (v.associacao_id = ${associacaoId} or p.associacao_id = ${associacaoId}))
      + (select count(*) from entregas e
          where e.projeto_id = ${projetoId} and e.deleted_at is null and e.associacao_id = ${associacaoId})
        as total`,
      )
      .then((r) => r.rows);
    return Number(row?.total ?? 0);
  }
}
