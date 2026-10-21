import { and, asc, desc, eq, exists, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { produtor, type NewProdutor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { associacao } from "../../db/associacao.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import { ehEmailTecnico, somenteDigitos } from "../../lib/documentos.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";
import { associacaoNoEscopo } from "../projetos/projetos.repository.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  nome: user.name,
  createdAt: produtor.createdAt,
} as const;

/**
 * Quem enxerga o produtor: sem escopo (`undefined`), todos; com escopo, os que
 * têm propriedade numa associação visível OU que o próprio usuário cadastrou
 * (senão o técnico perde de vista o produtor antes de criar a propriedade).
 */
export type Visibilidade = { escopo: Escopo; userId: string | null };

/** Propriedades vivas do produtor (coluna `produtores.id` da query) em associação visível. */
const propriedadesVisiveis = (escopo: Escopo, campo: SQL = sql`1`) =>
  db
    .select({ campo })
    .from(propriedade)
    .innerJoin(associacao, eq(associacao.id, propriedade.associacaoId))
    .where(
      and(
        eq(propriedade.produtorId, produtor.id),
        isNull(propriedade.deletedAt),
        isNull(associacao.deletedAt),
        associacaoNoEscopo(escopo),
      ),
    );

/** Condição SQL de visibilidade do produtor — use em queries com `produtores` no FROM. */
export function produtorVisivel({ escopo, userId }: Visibilidade) {
  if (escopo === undefined) return undefined;
  return or(exists(propriedadesVisiveis(escopo)), userId ? eq(produtor.createdBy, userId) : undefined);
}

const colunas = (escopo: Escopo) => ({
  id: produtor.id,
  userId: produtor.userId,
  nome: user.name,
  email: user.email,
  telefone: user.phoneNumber,
  cpf: produtor.cpf,
  observacao: produtor.observacao,
  ativo: produtor.ativo,
  // Subconsulta correlacionada (o Drizzle põe os parênteses): só as que o usuário enxerga
  totalPropriedades: sql<number>`${propriedadesVisiveis(escopo, sql`cast(count(*) as int)`)}`,
});

type ProdutorRow = {
  id: string;
  userId: string;
  nome: string;
  email: string;
  telefone: string | null;
  cpf: string | null;
  observacao: string | null;
  ativo: boolean;
  totalPropriedades: number;
};
export type ProdutorResposta = Omit<ProdutorRow, "email"> & { email: string | null };

/** O e-mail técnico de quem não tem e-mail não sai da API — vira null. */
const paraResposta = (row: ProdutorRow): ProdutorResposta => ({
  ...row,
  email: ehEmailTecnico(row.email) ? null : row.email,
  totalPropriedades: Number(row.totalPropriedades),
});

type Filtros = Visibilidade & { busca?: string; associacaoId?: string; ativo?: boolean };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

function where({ busca, associacaoId, ativo, ...visibilidade }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  // CPF e telefone ficam só com dígitos no banco — "529.982" também acha
  const digitos = busca ? somenteDigitos(busca) : "";
  const termoDigitos = digitos ? `%${digitos}%` : undefined;
  return and(
    isNull(produtor.deletedAt),
    termo
      ? or(
          ilike(user.name, termo),
          termoDigitos ? ilike(produtor.cpf, termoDigitos) : undefined,
          termoDigitos ? ilike(user.phoneNumber, termoDigitos) : undefined,
        )
      : undefined,
    ativo !== undefined ? eq(produtor.ativo, ativo) : undefined,
    associacaoId
      ? exists(
          db
            .select({ um: sql`1` })
            .from(propriedade)
            .where(
              and(
                eq(propriedade.produtorId, produtor.id),
                eq(propriedade.associacaoId, associacaoId),
                isNull(propriedade.deletedAt),
              ),
            ),
        )
      : undefined,
    produtorVisivel(visibilidade),
  );
}

export default class ProdutoresRepository {
  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "nome"];
    const direcao = sort?.direcao === "desc" ? desc : asc;
    const rows = await tx
      .select(colunas(filtros.escopo))
      .from(produtor)
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(produtor.id))
      .limit(limit)
      .offset(offset);
    return rows.map(paraResposta);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(produtor)
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Produtor vivo e visível (mesmo critério da listagem). */
  async porId(
    id: string,
    visibilidade: Visibilidade,
    tx: DbOrTx = db,
  ): Promise<ProdutorResposta | undefined> {
    const [row] = await tx
      .select(colunas(visibilidade.escopo))
      .from(produtor)
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(and(eq(produtor.id, id), isNull(produtor.deletedAt), produtorVisivel(visibilidade)))
      .limit(1);
    return row ? paraResposta(row) : undefined;
  }

  /** Por id SEM filtrar soft delete — para reativar. */
  async porIdIncluindoExcluidos(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({
        id: produtor.id,
        cpf: produtor.cpf,
        createdBy: produtor.createdBy,
        deletedAt: produtor.deletedAt,
      })
      .from(produtor)
      .where(eq(produtor.id, id))
      .limit(1);
    return row;
  }

  /** Perfil do usuário, inclusive excluído (`user_id` tem unique TOTAL). */
  async porUsuarioIncluindoExcluidos(
    userId: string,
    tx: DbOrTx = db,
  ): Promise<{ id: string; deletedAt: Date | null } | undefined> {
    const [row] = await tx
      .select({ id: produtor.id, deletedAt: produtor.deletedAt })
      .from(produtor)
      .where(eq(produtor.userId, userId))
      .limit(1);
    return row;
  }

  /** Outro produtor vivo com o mesmo CPF (unique parcial). */
  async porCpf(cpf: string, excetoId?: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: produtor.id })
      .from(produtor)
      .where(
        and(
          eq(produtor.cpf, cpf),
          isNull(produtor.deletedAt),
          excetoId ? ne(produtor.id, excetoId) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  async inserir(data: NewProdutor, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(produtor).values(data).returning({ id: produtor.id });
    return row;
  }

  async alterar(
    id: string,
    data: Partial<NewProdutor>,
    tx: DbOrTx = db,
  ): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(produtor)
      .set(campos)
      .where(and(eq(produtor.id, id), isNull(produtor.deletedAt)))
      .returning({ id: produtor.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(produtor)
      .set({ deletedAt: new Date() })
      .where(and(eq(produtor.id, id), isNull(produtor.deletedAt)))
      .returning({ id: produtor.id });
    return row;
  }

  async reativar(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(produtor)
      .set({ deletedAt: null })
      .where(eq(produtor.id, id))
      .returning({ id: produtor.id });
    return row;
  }

  /** Propriedades vivas do produtor (qualquer escopo) — impedem a exclusão. */
  async contarPropriedades(id: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(propriedade)
      .where(and(eq(propriedade.produtorId, id), isNull(propriedade.deletedAt)))
      .limit(1);
    return row?.total ?? 0;
  }

  // ─── Pessoa (tabela user) ─────────────────────────────────────────────────

  /** Dados crus da pessoa (e-mail técnico incluído) para a edição pelo produtor. */
  async pessoa(userId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: user.id, email: user.email, telefone: user.phoneNumber, papel: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return row;
  }

  async outraPessoaComEmail(email: string, userId: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, email), ne(user.id, userId)))
      .limit(1);
    return Boolean(row);
  }

  async outraPessoaComTelefone(telefone: string, userId: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.phoneNumber, telefone), ne(user.id, userId)))
      .limit(1);
    return Boolean(row);
  }

  async alterarPessoa(
    userId: string,
    data: { name?: string; email?: string; phoneNumber?: string | null },
    tx: DbOrTx = db,
  ): Promise<void> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return;
    await tx
      .update(user)
      .set({ ...campos, updatedAt: new Date() })
      .where(eq(user.id, userId));
  }
}
