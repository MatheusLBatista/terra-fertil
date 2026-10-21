import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { evento, type NewEvento } from "../../db/evento.ts";
import { eventoParticipante, type NewEventoParticipante } from "../../db/eventoParticipante.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { associacao } from "../../db/associacao.ts";
import { municipio } from "../../db/municipio.ts";
import { projetoAssociacao } from "../../db/projetoAssociacao.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import { diaSeguinte, inicioDoDia } from "../../lib/datas.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  inicio: evento.inicio,
  titulo: evento.titulo,
  situacao: evento.situacao,
  createdAt: evento.createdAt,
} as const;

type Filtros = {
  projetoId?: string;
  tipo?: (typeof evento.tipo.enumValues)[number];
  situacao?: (typeof evento.situacao.enumValues)[number];
  associacaoId?: string;
  municipioId?: number;
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

// Totais da lista de presença (subconsultas correlacionadas — uma query só, sem N+1)
const totalParticipantes = sql<number>`(
  select cast(count(*) as int) from ${eventoParticipante}
   where ${eventoParticipante.eventoId} = ${evento.id} and ${eventoParticipante.deletedAt} is null)`;
const totalPresentes = sql<number>`(
  select cast(count(*) as int) from ${eventoParticipante}
   where ${eventoParticipante.eventoId} = ${evento.id} and ${eventoParticipante.deletedAt} is null
     and ${eventoParticipante.presente})`;

const colunas = {
  id: evento.id,
  projetoId: evento.projetoId,
  titulo: evento.titulo,
  tipo: evento.tipo,
  temaId: evento.temaId,
  temaNome: opcaoDiagnostico.nome,
  associacaoId: evento.associacaoId,
  associacaoSigla: associacao.sigla,
  municipioId: evento.municipioId,
  municipioNome: municipio.nome,
  local: evento.local,
  inicio: evento.inicio,
  fim: evento.fim,
  cargaHoraria: evento.cargaHoraria,
  instrutor: evento.instrutor,
  situacao: evento.situacao,
  relato: evento.relato,
  totalParticipantes,
  totalPresentes,
};

function where({ projetoId, tipo, situacao, associacaoId, municipioId, de, ate, busca, escopo }: Filtros) {
  return and(
    isNull(evento.deletedAt),
    projetoId ? eq(evento.projetoId, projetoId) : undefined,
    tipo ? eq(evento.tipo, tipo) : undefined,
    situacao ? eq(evento.situacao, situacao) : undefined,
    associacaoId ? eq(evento.associacaoId, associacaoId) : undefined,
    municipioId ? eq(evento.municipioId, municipioId) : undefined,
    de ? gte(evento.inicio, inicioDoDia(de)) : undefined,
    ate ? lt(evento.inicio, diaSeguinte(ate)) : undefined,
    busca ? ilike(evento.titulo, `%${escaparLike(busca)}%`) : undefined,
    escopo ? inArray(evento.projetoId, escopo) : undefined,
  );
}

export type ParticipanteAtual = { id: string; produtorId: string; presente: boolean };

export default class EventosRepository {
  private base(tx: DbOrTx) {
    return tx
      .select(colunas)
      .from(evento)
      .leftJoin(opcaoDiagnostico, eq(opcaoDiagnostico.id, evento.temaId))
      .leftJoin(associacao, eq(associacao.id, evento.associacaoId))
      .innerJoin(municipio, eq(municipio.id, evento.municipioId));
  }

  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "inicio"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    return this.base(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(evento.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(evento)
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db) {
    const [row] = await this.base(tx)
      .where(and(eq(evento.id, id), isNull(evento.deletedAt)))
      .limit(1);
    return row;
  }

  async inserir(data: NewEvento, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(evento).values(data).returning({ id: evento.id });
    return row;
  }

  async alterar(id: string, data: Partial<NewEvento>, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(evento)
      .set(campos)
      .where(and(eq(evento.id, id), isNull(evento.deletedAt)))
      .returning({ id: evento.id });
    return row;
  }

  /** Soft delete do evento — a lista de presença fica (o evento some das leituras e das contagens). */
  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(evento)
      .set({ deletedAt: new Date() })
      .where(and(eq(evento.id, id), isNull(evento.deletedAt)))
      .returning({ id: evento.id });
    return row;
  }

  // ─── Referências ──────────────────────────────────────────────────────────

  async temaPorId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: opcaoDiagnostico.id, grupo: opcaoDiagnostico.grupo, ativo: opcaoDiagnostico.ativo })
      .from(opcaoDiagnostico)
      .where(and(eq(opcaoDiagnostico.id, id), isNull(opcaoDiagnostico.deletedAt)))
      .limit(1);
    return row;
  }

  /** A associação tem adesão ATIVA (não excluída) ao projeto. */
  async temAdesaoAtiva(projetoId: string, associacaoId: string, tx: DbOrTx = db): Promise<boolean> {
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

  async municipioExiste(id: number, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: municipio.id })
      .from(municipio)
      .where(and(eq(municipio.id, id), isNull(municipio.deletedAt)))
      .limit(1);
    return Boolean(row);
  }

  // ─── Participantes ────────────────────────────────────────────────────────

  /**
   * Lista de presença com nome/telefone do produtor e a associação principal —
   * a da propriedade (viva) mais antiga do produtor —, montada em lote.
   */
  async listarParticipantes(eventoId: string, tx: DbOrTx = db) {
    const rows = await tx
      .select({
        produtorId: eventoParticipante.produtorId,
        nome: user.name,
        telefone: user.phoneNumber,
        presente: eventoParticipante.presente,
      })
      .from(eventoParticipante)
      .innerJoin(produtor, eq(produtor.id, eventoParticipante.produtorId))
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(and(eq(eventoParticipante.eventoId, eventoId), isNull(eventoParticipante.deletedAt)))
      .orderBy(asc(user.name), asc(eventoParticipante.id));
    if (rows.length === 0) return [];

    const vinculos = await tx
      .select({
        produtorId: propriedade.produtorId,
        associacaoId: associacao.id,
        associacaoSigla: associacao.sigla,
      })
      .from(propriedade)
      .innerJoin(associacao, eq(associacao.id, propriedade.associacaoId))
      .where(
        and(
          inArray(
            propriedade.produtorId,
            rows.map((r) => r.produtorId),
          ),
          isNull(propriedade.deletedAt),
          isNull(associacao.deletedAt),
        ),
      )
      .orderBy(asc(propriedade.createdAt), asc(propriedade.id));
    const principal = new Map<string, { associacaoId: string; associacaoSigla: string }>();
    for (const v of vinculos) {
      if (!principal.has(v.produtorId)) principal.set(v.produtorId, v);
    }

    return rows.map((r) => ({
      produtorId: r.produtorId,
      nome: r.nome,
      telefone: r.telefone,
      associacaoId: principal.get(r.produtorId)?.associacaoId ?? null,
      associacaoSigla: principal.get(r.produtorId)?.associacaoSigla ?? null,
      presente: r.presente,
    }));
  }

  async participantesAtuais(eventoId: string, tx: DbOrTx = db): Promise<ParticipanteAtual[]> {
    return tx
      .select({
        id: eventoParticipante.id,
        produtorId: eventoParticipante.produtorId,
        presente: eventoParticipante.presente,
      })
      .from(eventoParticipante)
      .where(and(eq(eventoParticipante.eventoId, eventoId), isNull(eventoParticipante.deletedAt)));
  }

  /** Produtores (não excluídos) entre os ids — com nome, para mensagens. */
  async produtoresPorIds(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return [];
    return tx
      .select({ id: produtor.id, nome: user.name, ativo: produtor.ativo })
      .from(produtor)
      .innerJoin(user, eq(user.id, produtor.userId))
      .where(and(inArray(produtor.id, ids), isNull(produtor.deletedAt)));
  }

  async inserirParticipantes(rows: NewEventoParticipante[], tx: DbOrTx = db) {
    if (rows.length === 0) return;
    await tx.insert(eventoParticipante).values(rows);
  }

  async excluirParticipantes(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return;
    await tx
      .update(eventoParticipante)
      .set({ deletedAt: new Date() })
      .where(and(inArray(eventoParticipante.id, ids), isNull(eventoParticipante.deletedAt)));
  }

  async marcarPresenca(ids: string[], presente: boolean, tx: DbOrTx = db) {
    if (ids.length === 0) return;
    await tx
      .update(eventoParticipante)
      .set({ presente })
      .where(and(inArray(eventoParticipante.id, ids), isNull(eventoParticipante.deletedAt)));
  }

  // ─── Meta 6 (para o módulo de metas) ──────────────────────────────────────

  /**
   * Meta 6 — eventos com situação `realizado` (não excluídos) do projeto.
   * Planejados e cancelados não contam.
   */
  async contarRealizados(projetoId: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(evento)
      .where(
        and(eq(evento.projetoId, projetoId), eq(evento.situacao, "realizado"), isNull(evento.deletedAt)),
      );
    return row?.total ?? 0;
  }

  /**
   * Meta 6 — "agricultores capacitados": produtores DISTINTOS marcados como
   * presentes em algum evento REALIZADO (não excluído) do projeto. O mesmo
   * produtor em vários eventos conta uma vez; participante excluído da lista
   * (soft delete) não conta.
   */
  async contarCapacitados(projetoId: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(distinct ${eventoParticipante.produtorId}) as int)` })
      .from(eventoParticipante)
      .innerJoin(evento, eq(evento.id, eventoParticipante.eventoId))
      .where(
        and(
          eq(evento.projetoId, projetoId),
          eq(evento.situacao, "realizado"),
          isNull(evento.deletedAt),
          eq(eventoParticipante.presente, true),
          isNull(eventoParticipante.deletedAt),
        ),
      );
    return row?.total ?? 0;
  }
}
