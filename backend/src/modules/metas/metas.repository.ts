import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "../../db/index.ts";
import { meta, type NewMeta } from "../../db/meta.ts";
import { indicador, type NewIndicador } from "../../db/indicador.ts";
import { etapaIndicador, type NewEtapaIndicador } from "../../db/etapaIndicador.ts";
import { lancamentoFinanceiro } from "../../db/lancamentoFinanceiro.ts";
import { producao } from "../../db/producao.ts";
import { associacao } from "../../db/associacao.ts";
import { projetoAssociacao } from "../../db/projetoAssociacao.ts";
import { diagnosticoAssociacao } from "../../db/diagnosticoAssociacao.ts";
import { associacaoDocumento } from "../../db/associacaoDocumento.ts";
import { tipoDocumento } from "../../db/tipoDocumento.ts";
import { analiseSolo } from "../../db/analiseSolo.ts";
import { entrega } from "../../db/entrega.ts";
import { visita } from "../../db/visita.ts";
import { visitaAnexo } from "../../db/visitaAnexo.ts";
import { evento } from "../../db/evento.ts";
import { eventoParticipante } from "../../db/eventoParticipante.ts";
import { projetoEquipe } from "../../db/projetoEquipe.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import { CHAVES_APURACAO, type ChaveApuracao } from "./apuracao.ts";

const colunasMeta = {
  id: meta.id,
  projetoId: meta.projetoId,
  numero: meta.numero,
  descricao: meta.descricao,
  valorAprovadoCentavos: meta.valorAprovadoCentavos,
  peso: meta.peso,
  situacao: meta.situacao,
};

const colunasIndicador = {
  id: indicador.id,
  metaId: indicador.metaId,
  descricao: indicador.descricao,
  ordem: indicador.ordem,
};

const colunasEtapa = {
  id: etapaIndicador.id,
  indicadorId: etapaIndicador.indicadorId,
  descricao: etapaIndicador.descricao,
  quantidadePrevista: etapaIndicador.quantidadePrevista,
  peso: etapaIndicador.peso,
  apuracao: etapaIndicador.apuracao,
  chave: etapaIndicador.chave,
  quantidadeManual: etapaIndicador.quantidadeManual,
  ordem: etapaIndicador.ordem,
};

export type MetaRow = NonNullable<Awaited<ReturnType<MetasRepository["porId"]>>>;
export type IndicadorRow = Awaited<ReturnType<MetasRepository["indicadoresDasMetas"]>>[number];
export type EtapaRow = Awaited<ReturnType<MetasRepository["etapasDosIndicadores"]>>[number];

// ─── Consultas de apuração (allowlist em apuracao.ts) ───────────────────────

/** Texto preenchido (não nulo e não só espaços). */
const preenchido = (coluna: AnyPgColumn) => sql`nullif(btrim(${coluna}), '') is not null`;

const total = async (q: Promise<{ total: number }[]>) => (await q)[0]?.total ?? 0;

type Consulta = (projetoId: string, tx: DbOrTx) => Promise<number>;

/** Contagem de produções concluídas do projeto dos tipos informados. */
const producoesConcluidas =
  (...tipos: (typeof producao.tipo.enumValues)[number][]): Consulta =>
  (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(producao)
        .where(
          and(
            eq(producao.projetoId, projetoId),
            isNull(producao.deletedAt),
            inArray(producao.tipo, tipos),
            isNotNull(producao.concluidaEm),
          ),
        ),
    );

/** Entregas (LINHAS, não Σ quantidade) do projeto que atendem à condição. */
const contarEntregas =
  (condicao: SQL): Consulta =>
  (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(entrega)
        .where(and(eq(entrega.projetoId, projetoId), isNull(entrega.deletedAt), condicao)),
    );

/** Membros da equipe do tipo informado com data de contratação. */
const contratados =
  (tipo: (typeof projetoEquipe.tipo.enumValues)[number]): Consulta =>
  (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(projetoEquipe)
        .where(
          and(
            eq(projetoEquipe.projetoId, projetoId),
            isNull(projetoEquipe.deletedAt),
            eq(projetoEquipe.tipo, tipo),
            isNotNull(projetoEquipe.contratadoEm),
          ),
        ),
    );

/** Adesões vivas do projeto com a condição (uma por associação — unique parcial). */
const contarAdesoes =
  (condicao: (projetoId: string) => SQL | undefined): Consulta =>
  (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(projetoAssociacao)
        .innerJoin(associacao, eq(associacao.id, projetoAssociacao.associacaoId))
        .where(
          and(
            eq(projetoAssociacao.projetoId, projetoId),
            isNull(projetoAssociacao.deletedAt),
            isNull(associacao.deletedAt),
            condicao(projetoId),
          ),
        ),
    );

/** Nome do tipo de documento que conta para a Meta 2 (comparado sem caixa). */
const TIPO_PLANO_GESTAO = "Plano de gestão de equipamentos";

/**
 * Uma consulta FIXA por nome — `CHAVES_APURACAO.<chave>.consulta` aponta para cá.
 * Todas filtram `projeto_id = $1` e `deleted_at is null` (parâmetros, nunca texto do banco).
 * Entregas contam linhas (cada linha é um item destinado a uma associação), não a quantidade.
 */
export const CONSULTAS_APURACAO = {
  associacoesComVisitaInicial: (projetoId, tx) =>
    total(
      tx
        .select({ total: countDistinct(visita.associacaoId) })
        .from(visita)
        .innerJoin(associacao, eq(associacao.id, visita.associacaoId))
        .where(
          and(
            eq(visita.projetoId, projetoId),
            isNull(visita.deletedAt),
            isNull(associacao.deletedAt),
            eq(visita.tipo, "inicial_associacao"),
            eq(visita.situacao, "realizada"),
          ),
        ),
    ),

  associacoesComDiagnosticoRevisado: (projetoId, tx) =>
    total(
      tx
        .select({ total: countDistinct(projetoAssociacao.associacaoId) })
        .from(projetoAssociacao)
        .innerJoin(associacao, eq(associacao.id, projetoAssociacao.associacaoId))
        .innerJoin(
          diagnosticoAssociacao,
          eq(diagnosticoAssociacao.associacaoId, projetoAssociacao.associacaoId),
        )
        .where(
          and(
            eq(projetoAssociacao.projetoId, projetoId),
            isNull(projetoAssociacao.deletedAt),
            isNull(associacao.deletedAt),
            isNull(diagnosticoAssociacao.deletedAt),
            eq(diagnosticoAssociacao.revisado, true),
          ),
        ),
    ),

  associacoesComDemanda: contarAdesoes((projetoId) =>
    or(
      preenchido(projetoAssociacao.demandaInicial),
      exists(
        db
          .select({ um: sql`1` })
          .from(entrega)
          .where(
            and(
              eq(entrega.projetoId, projetoId),
              eq(entrega.associacaoId, projetoAssociacao.associacaoId),
              isNull(entrega.deletedAt),
              ne(entrega.situacao, "cancelado"),
            ),
          ),
      ),
    ),
  ),

  associacoesComParceria: contarAdesoes(() => isNotNull(projetoAssociacao.parceriaFormalizadaEm)),

  associacoesComPlanoGestao: (projetoId, tx) =>
    total(
      tx
        .select({ total: countDistinct(associacaoDocumento.associacaoId) })
        .from(associacaoDocumento)
        .innerJoin(tipoDocumento, eq(tipoDocumento.id, associacaoDocumento.tipoDocumentoId))
        .innerJoin(associacao, eq(associacao.id, associacaoDocumento.associacaoId))
        .where(
          and(
            eq(associacaoDocumento.projetoId, projetoId),
            isNull(associacaoDocumento.deletedAt),
            isNull(associacao.deletedAt),
            eq(associacaoDocumento.situacao, "validado"),
            sql`lower(${tipoDocumento.nome}) = lower(${TIPO_PLANO_GESTAO})`,
          ),
        ),
    ),

  analisesComLaudo: (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(analiseSolo)
        .where(
          and(
            eq(analiseSolo.projetoId, projetoId),
            isNull(analiseSolo.deletedAt),
            preenchido(analiseSolo.laudoUrl),
          ),
        ),
    ),

  entregasDemandadas: contarEntregas(ne(entrega.situacao, "cancelado")),
  entregasCompradas: contarEntregas(inArray(entrega.situacao, ["comprado", "entregue"])),
  entregasComTermo: contarEntregas(preenchido(entrega.termoUsoKey)),
  entregasEntregues: contarEntregas(eq(entrega.situacao, "entregue")),

  visitasAssistencia: (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(visita)
        .where(
          and(
            eq(visita.projetoId, projetoId),
            isNull(visita.deletedAt),
            eq(visita.tipo, "assistencia_tecnica"),
            eq(visita.situacao, "realizada"),
          ),
        ),
    ),

  visitasRetorno: (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(visita)
        .where(
          and(
            eq(visita.projetoId, projetoId),
            isNull(visita.deletedAt),
            eq(visita.tipo, "acompanhamento"),
            eq(visita.situacao, "realizada"),
            or(
              preenchido(visita.relato),
              exists(
                db
                  .select({ um: sql`1` })
                  .from(visitaAnexo)
                  .where(and(eq(visitaAnexo.visitaId, visita.id), isNull(visitaAnexo.deletedAt))),
              ),
            ),
          ),
        ),
    ),

  eventosRealizados: (projetoId, tx) =>
    total(
      tx
        .select({ total: count() })
        .from(evento)
        .where(
          and(eq(evento.projetoId, projetoId), isNull(evento.deletedAt), eq(evento.situacao, "realizado")),
        ),
    ),

  produtoresCapacitados: (projetoId, tx) =>
    total(
      tx
        .select({ total: countDistinct(eventoParticipante.produtorId) })
        .from(eventoParticipante)
        .innerJoin(evento, eq(evento.id, eventoParticipante.eventoId))
        .where(
          and(
            eq(evento.projetoId, projetoId),
            isNull(evento.deletedAt),
            eq(evento.situacao, "realizado"),
            isNull(eventoParticipante.deletedAt),
            eq(eventoParticipante.presente, true),
          ),
        ),
    ),

  estudantesContratados: contratados("estudante"),
  coordenadoresContratados: contratados("coordenador"),

  producoesRelatorioTecnicoParticipativo: producoesConcluidas("relatorio_tecnico_participativo"),
  producoesRelatorioOuResumo: producoesConcluidas("relatorio_tecnico", "resumo_cientifico"),
  producoesRelatorioPesquisa: producoesConcluidas("relatorio_pesquisa"),

  /** round(100 × Σ despesa ÷ Σ liberação); 0 sem liberação. */
  execucaoFinanceira: async (projetoId, tx) => {
    const somar = (tipo: (typeof lancamentoFinanceiro.tipo.enumValues)[number]) =>
      sql<string>`coalesce(sum(${lancamentoFinanceiro.valorCentavos}) filter (where ${eq(lancamentoFinanceiro.tipo, tipo)}), 0)::text`;
    const [row] = await tx
      .select({ liberado: somar("liberacao"), despesa: somar("despesa") })
      .from(lancamentoFinanceiro)
      .where(and(eq(lancamentoFinanceiro.projetoId, projetoId), isNull(lancamentoFinanceiro.deletedAt)));
    const liberado = Number(row?.liberado ?? 0);
    const despesa = Number(row?.despesa ?? 0);
    return liberado > 0 ? Math.round((100 * despesa) / liberado) : 0;
  },
} satisfies Record<string, Consulta>;

export type NomeConsulta = keyof typeof CONSULTAS_APURACAO;

export default class MetasRepository {
  // ─── Apuração ─────────────────────────────────────────────────────────────

  /** Executa a consulta da allowlist para a chave (a chave já foi validada pelo chamador). */
  async apurar(chave: ChaveApuracao, projetoId: string, tx: DbOrTx = db): Promise<number> {
    return CONSULTAS_APURACAO[CHAVES_APURACAO[chave].consulta](projetoId, tx);
  }

  // ─── Metas ────────────────────────────────────────────────────────────────

  async listarPorProjeto(projetoId: string, tx: DbOrTx = db) {
    return tx
      .select(colunasMeta)
      .from(meta)
      .where(and(eq(meta.projetoId, projetoId), isNull(meta.deletedAt)))
      .orderBy(asc(meta.numero), asc(meta.id));
  }

  async porId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunasMeta)
      .from(meta)
      .where(and(eq(meta.id, id), isNull(meta.deletedAt)))
      .limit(1);
    return row;
  }

  async porNumero(projetoId: string, numero: number, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: meta.id })
      .from(meta)
      .where(and(eq(meta.projetoId, projetoId), eq(meta.numero, numero), isNull(meta.deletedAt)))
      .limit(1);
    return row;
  }

  /** Σ peso das metas vivas do projeto. */
  async somaPesos(projetoId: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ soma: sql<string>`coalesce(sum(${meta.peso}), 0)::text` })
      .from(meta)
      .where(and(eq(meta.projetoId, projetoId), isNull(meta.deletedAt)));
    return Number(row?.soma ?? 0);
  }

  async inserir(data: NewMeta, tx: DbOrTx = db) {
    const [row] = await tx.insert(meta).values(data).returning(colunasMeta);
    return row;
  }

  async alterar(id: string, data: Partial<NewMeta>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return this.porId(id, tx);
    const [row] = await tx
      .update(meta)
      .set(campos)
      .where(and(eq(meta.id, id), isNull(meta.deletedAt)))
      .returning(colunasMeta);
    return row;
  }

  /** Produções e lançamentos vivos que apontam para a meta — impedem a exclusão. */
  async contarUsos(id: string, tx: DbOrTx = db): Promise<number> {
    const [producoes, lancamentos] = await Promise.all([
      total(
        tx
          .select({ total: count() })
          .from(producao)
          .where(and(eq(producao.metaId, id), isNull(producao.deletedAt))),
      ),
      total(
        tx
          .select({ total: count() })
          .from(lancamentoFinanceiro)
          .where(and(eq(lancamentoFinanceiro.metaId, id), isNull(lancamentoFinanceiro.deletedAt))),
      ),
    ]);
    return producoes + lancamentos;
  }

  /** Soft delete da meta com seus indicadores e etapas (chame dentro de transação). */
  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const agora = new Date();
    const indicadoresDaMeta = tx
      .select({ id: indicador.id })
      .from(indicador)
      .where(and(eq(indicador.metaId, id), isNull(indicador.deletedAt)));
    await tx
      .update(etapaIndicador)
      .set({ deletedAt: agora })
      .where(and(inArray(etapaIndicador.indicadorId, indicadoresDaMeta), isNull(etapaIndicador.deletedAt)));
    await tx
      .update(indicador)
      .set({ deletedAt: agora })
      .where(and(eq(indicador.metaId, id), isNull(indicador.deletedAt)));
    const [row] = await tx
      .update(meta)
      .set({ deletedAt: agora })
      .where(and(eq(meta.id, id), isNull(meta.deletedAt)))
      .returning({ id: meta.id });
    return row;
  }

  // ─── Indicadores ──────────────────────────────────────────────────────────

  async indicadoresDasMetas(metaIds: string[], tx: DbOrTx = db) {
    if (metaIds.length === 0) return [];
    return tx
      .select(colunasIndicador)
      .from(indicador)
      .where(and(inArray(indicador.metaId, metaIds), isNull(indicador.deletedAt)))
      .orderBy(asc(indicador.ordem), asc(indicador.createdAt), asc(indicador.id));
  }

  /** Indicador vivo de uma meta viva, com o projeto (para o escopo). */
  async indicadorPorId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ ...colunasIndicador, projetoId: meta.projetoId })
      .from(indicador)
      .innerJoin(meta, eq(meta.id, indicador.metaId))
      .where(and(eq(indicador.id, id), isNull(indicador.deletedAt), isNull(meta.deletedAt)))
      .limit(1);
    return row;
  }

  async inserirIndicador(data: NewIndicador, tx: DbOrTx = db) {
    const [row] = await tx.insert(indicador).values(data).returning(colunasIndicador);
    return row;
  }

  async alterarIndicador(id: string, data: Partial<NewIndicador>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) {
      const [atual] = await tx
        .select(colunasIndicador)
        .from(indicador)
        .where(and(eq(indicador.id, id), isNull(indicador.deletedAt)))
        .limit(1);
      return atual;
    }
    const [row] = await tx
      .update(indicador)
      .set(campos)
      .where(and(eq(indicador.id, id), isNull(indicador.deletedAt)))
      .returning(colunasIndicador);
    return row;
  }

  /** Soft delete do indicador com as etapas (chame dentro de transação). */
  async excluirIndicador(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const agora = new Date();
    await tx
      .update(etapaIndicador)
      .set({ deletedAt: agora })
      .where(and(eq(etapaIndicador.indicadorId, id), isNull(etapaIndicador.deletedAt)));
    const [row] = await tx
      .update(indicador)
      .set({ deletedAt: agora })
      .where(and(eq(indicador.id, id), isNull(indicador.deletedAt)))
      .returning({ id: indicador.id });
    return row;
  }

  // ─── Etapas ───────────────────────────────────────────────────────────────

  async etapasDosIndicadores(indicadorIds: string[], tx: DbOrTx = db) {
    if (indicadorIds.length === 0) return [];
    return tx
      .select(colunasEtapa)
      .from(etapaIndicador)
      .where(and(inArray(etapaIndicador.indicadorId, indicadorIds), isNull(etapaIndicador.deletedAt)))
      .orderBy(asc(etapaIndicador.ordem), asc(etapaIndicador.createdAt), asc(etapaIndicador.id));
  }

  /** Etapa viva de indicador e meta vivos, com o projeto (para o escopo). */
  async etapaPorId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ ...colunasEtapa, projetoId: meta.projetoId })
      .from(etapaIndicador)
      .innerJoin(indicador, eq(indicador.id, etapaIndicador.indicadorId))
      .innerJoin(meta, eq(meta.id, indicador.metaId))
      .where(
        and(
          eq(etapaIndicador.id, id),
          isNull(etapaIndicador.deletedAt),
          isNull(indicador.deletedAt),
          isNull(meta.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async inserirEtapa(data: NewEtapaIndicador, tx: DbOrTx = db) {
    const [row] = await tx.insert(etapaIndicador).values(data).returning(colunasEtapa);
    return row;
  }

  async alterarEtapa(id: string, data: Partial<NewEtapaIndicador>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) {
      const [atual] = await tx
        .select(colunasEtapa)
        .from(etapaIndicador)
        .where(and(eq(etapaIndicador.id, id), isNull(etapaIndicador.deletedAt)))
        .limit(1);
      return atual;
    }
    const [row] = await tx
      .update(etapaIndicador)
      .set(campos)
      .where(and(eq(etapaIndicador.id, id), isNull(etapaIndicador.deletedAt)))
      .returning(colunasEtapa);
    return row;
  }

  async excluirEtapa(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(etapaIndicador)
      .set({ deletedAt: new Date() })
      .where(and(eq(etapaIndicador.id, id), isNull(etapaIndicador.deletedAt)))
      .returning({ id: etapaIndicador.id });
    return row;
  }
}
