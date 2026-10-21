import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { producao, type NewProducao } from "../../db/producao.ts";
import { producaoAutor } from "../../db/producaoAutor.ts";
import { meta } from "../../db/meta.ts";
import { projetoEquipe } from "../../db/projetoEquipe.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  titulo: producao.titulo,
  concluidaEm: producao.concluidaEm,
  createdAt: producao.createdAt,
} as const;

type Filtros = {
  projetoId?: string;
  tipo?: (typeof producao.tipo.enumValues)[number];
  metaId?: string;
  concluida?: boolean;
  busca?: string;
  escopo?: Escopo;
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

// A key do arquivo não sai na API (o arquivo é privado) — só se ele existe
const colunas = {
  id: producao.id,
  projetoId: producao.projetoId,
  titulo: producao.titulo,
  tipo: producao.tipo,
  metaId: producao.metaId,
  metaNumero: meta.numero,
  concluidaEm: producao.concluidaEm,
  url: producao.url,
  resumo: producao.resumo,
  temArquivo: sql<boolean>`(${producao.arquivoKey} is not null)`,
};

type ProducaoRow = {
  id: string;
  projetoId: string;
  titulo: string;
  tipo: (typeof producao.tipo.enumValues)[number];
  metaId: string | null;
  metaNumero: number | null;
  concluidaEm: string | null;
  url: string | null;
  resumo: string | null;
  temArquivo: boolean;
};

export type Autor = { projetoEquipeId: string; nome: string };

function where({ projetoId, tipo, metaId, concluida, busca, escopo }: Filtros) {
  return and(
    isNull(producao.deletedAt),
    projetoId ? eq(producao.projetoId, projetoId) : undefined,
    tipo ? eq(producao.tipo, tipo) : undefined,
    metaId ? eq(producao.metaId, metaId) : undefined,
    concluida === undefined
      ? undefined
      : concluida
        ? isNotNull(producao.concluidaEm)
        : isNull(producao.concluidaEm),
    busca ? ilike(producao.titulo, `%${escaparLike(busca)}%`) : undefined,
    escopo ? inArray(producao.projetoId, escopo) : undefined,
  );
}

export default class ProducoesRepository {
  private base(tx: DbOrTx) {
    return tx.select(colunas).from(producao).leftJoin(meta, eq(meta.id, producao.metaId));
  }

  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "createdAt"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    const rows = await this.base(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(producao.id))
      .limit(limit)
      .offset(offset);
    return this.comAutores(rows, tx);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(producao)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db) {
    const [row] = await this.base(tx)
      .where(and(eq(producao.id, id), isNull(producao.deletedAt)))
      .limit(1);
    if (!row) return undefined;
    const [comAutores] = await this.comAutores([row], tx);
    return comAutores;
  }

  /** Autores da página numa segunda query em lote (sem N+1), montados em memória. */
  private async comAutores(rows: ProducaoRow[], tx: DbOrTx) {
    if (rows.length === 0) return [];
    const autores = await tx
      .select({
        producaoId: producaoAutor.producaoId,
        projetoEquipeId: producaoAutor.projetoEquipeId,
        nome: user.name,
      })
      .from(producaoAutor)
      .innerJoin(projetoEquipe, eq(projetoEquipe.id, producaoAutor.projetoEquipeId))
      .innerJoin(user, eq(user.id, projetoEquipe.userId))
      .where(
        and(
          inArray(
            producaoAutor.producaoId,
            rows.map((r) => r.id),
          ),
          isNull(producaoAutor.deletedAt),
        ),
      )
      .orderBy(asc(user.name), asc(producaoAutor.id));
    const porProducao = new Map<string, Autor[]>();
    for (const a of autores) {
      const lista = porProducao.get(a.producaoId) ?? [];
      lista.push({ projetoEquipeId: a.projetoEquipeId, nome: a.nome });
      porProducao.set(a.producaoId, lista);
    }
    return rows.map((r) => ({ ...r, autores: porProducao.get(r.id) ?? [] }));
  }

  async inserir(data: NewProducao, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(producao).values(data).returning({ id: producao.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewProducao>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(producao)
      .set(campos)
      .where(and(eq(producao.id, id), isNull(producao.deletedAt)))
      .returning({ id: producao.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(producao)
      .set({ deletedAt: new Date() })
      .where(and(eq(producao.id, id), isNull(producao.deletedAt)))
      .returning({ id: producao.id });
    return row;
  }

  /** Key do arquivo no storage (undefined = produção inexistente; null = sem arquivo). */
  async arquivoKey(id: string, tx: DbOrTx = db): Promise<string | null | undefined> {
    const [row] = await tx
      .select({ arquivoKey: producao.arquivoKey })
      .from(producao)
      .where(and(eq(producao.id, id), isNull(producao.deletedAt)))
      .limit(1);
    return row?.arquivoKey;
  }

  async definirArquivo(
    id: string,
    arquivoKey: string | null,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(producao)
      .set({ arquivoKey })
      .where(and(eq(producao.id, id), isNull(producao.deletedAt)))
      .returning({ id: producao.id });
    return row;
  }

  // ─── Referências ──────────────────────────────────────────────────────────

  /** A meta existe, não foi excluída e é do projeto. */
  async metaDoProjeto(projetoId: string, metaId: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: meta.id })
      .from(meta)
      .where(and(eq(meta.id, metaId), eq(meta.projetoId, projetoId), isNull(meta.deletedAt)))
      .limit(1);
    return Boolean(row);
  }

  /** Dos ids informados, os que são membros (não excluídos) da equipe do projeto. */
  async membrosDoProjeto(projetoId: string, ids: string[], tx: DbOrTx = db): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await tx
      .select({ id: projetoEquipe.id })
      .from(projetoEquipe)
      .where(
        and(
          inArray(projetoEquipe.id, ids),
          eq(projetoEquipe.projetoId, projetoId),
          isNull(projetoEquipe.deletedAt),
        ),
      );
    return rows.map((r) => r.id);
  }

  // ─── Autores ──────────────────────────────────────────────────────────────

  async autoresAtuais(producaoId: string, tx: DbOrTx = db) {
    return tx
      .select({ id: producaoAutor.id, projetoEquipeId: producaoAutor.projetoEquipeId })
      .from(producaoAutor)
      .where(and(eq(producaoAutor.producaoId, producaoId), isNull(producaoAutor.deletedAt)));
  }

  async inserirAutores(producaoId: string, projetoEquipeIds: string[], tx: DbOrTx = db) {
    if (projetoEquipeIds.length === 0) return;
    await tx
      .insert(producaoAutor)
      .values(projetoEquipeIds.map((projetoEquipeId) => ({ producaoId, projetoEquipeId })));
  }

  async excluirAutores(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return;
    await tx
      .update(producaoAutor)
      .set({ deletedAt: new Date() })
      .where(and(inArray(producaoAutor.id, ids), isNull(producaoAutor.deletedAt)));
  }
}
