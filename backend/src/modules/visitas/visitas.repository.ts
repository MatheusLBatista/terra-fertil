import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { visita, type NewVisita } from "../../db/visita.ts";
import { visitaEquipe } from "../../db/visitaEquipe.ts";
import { visitaAnexo, type NewVisitaAnexo } from "../../db/visitaAnexo.ts";
import { visitaItemVerificado } from "../../db/visitaItemVerificado.ts";
import { entrega } from "../../db/entrega.ts";
import { item } from "../../db/item.ts";
import { diagnosticoPropriedade, type NewDiagnosticoPropriedade } from "../../db/diagnosticoPropriedade.ts";
import { diagnosticoOpcao } from "../../db/diagnosticoOpcao.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { projeto } from "../../db/projeto.ts";
import { projetoAssociacao } from "../../db/projetoAssociacao.ts";
import { projetoEquipe } from "../../db/projetoEquipe.ts";
import { associacao } from "../../db/associacao.ts";
import { propriedade } from "../../db/propriedade.ts";
import { produtor } from "../../db/produtor.ts";
import { papel } from "../../db/papel.ts";
import { user } from "../../db/user.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import { ehEmailTecnico } from "../../lib/documentos.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";

// O user aparece duas vezes na consulta: o técnico responsável e o produtor da propriedade
const tecnico = alias(user, "tecnico");
const pessoaProdutor = alias(user, "pessoa_produtor");

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  data: visita.data,
  tipo: visita.tipo,
  situacao: visita.situacao,
  createdAt: visita.createdAt,
} as const;

type Tipo = (typeof visita.tipo.enumValues)[number];
type Situacao = (typeof visita.situacao.enumValues)[number];

type Filtros = {
  escopo?: Escopo;
  projetoId?: string;
  tipo?: Tipo;
  situacao?: Situacao;
  associacaoId?: string;
  propriedadeId?: string;
  tecnicoId?: string;
  de?: string;
  ate?: string;
  busca?: string;
};
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: visita.id,
  projetoId: visita.projetoId,
  projetoSigla: projeto.sigla,
  tipo: visita.tipo,
  situacao: visita.situacao,
  associacaoId: visita.associacaoId,
  associacaoSigla: associacao.sigla,
  propriedadeId: visita.propriedadeId,
  propriedadeNome: propriedade.nome,
  produtorNome: pessoaProdutor.name,
  visitaAnteriorId: visita.visitaAnteriorId,
  data: visita.data,
  realizadaEm: visita.realizadaEm,
  tecnicoId: visita.tecnicoId,
  tecnicoNome: tecnico.name,
  latitude: visita.latitude,
  longitude: visita.longitude,
  relato: visita.relato,
  noticiaUrl: visita.noticiaUrl,
};

const colunasAnexo = {
  id: visitaAnexo.id,
  visitaId: visitaAnexo.visitaId,
  tipo: visitaAnexo.tipo,
  nomeArquivo: visitaAnexo.nomeArquivo,
  mimeType: visitaAnexo.mimeType,
  tamanhoBytes: visitaAnexo.tamanhoBytes,
  legenda: visitaAnexo.legenda,
  entregaId: visitaAnexo.entregaId,
  createdAt: visitaAnexo.createdAt,
};

const colunasDiagnostico = {
  visitaId: diagnosticoPropriedade.visitaId,
  areaProdutivaHa: diagnosticoPropriedade.areaProdutivaHa,
  areaPastagemHa: diagnosticoPropriedade.areaPastagemHa,
  areaPreservadaHa: diagnosticoPropriedade.areaPreservadaHa,
  principaisCulturas: diagnosticoPropriedade.principaisCulturas,
  rebanhoBovino: diagnosticoPropriedade.rebanhoBovino,
  fonteAgua: diagnosticoPropriedade.fonteAgua,
  possuiEnergia: diagnosticoPropriedade.possuiEnergia,
  possuiIrrigacao: diagnosticoPropriedade.possuiIrrigacao,
  pessoasTrabalham: diagnosticoPropriedade.pessoasTrabalham,
  analiseSoloRecente: diagnosticoPropriedade.analiseSoloRecente,
  acessoMaquinario: diagnosticoPropriedade.acessoMaquinario,
  comentarios: diagnosticoPropriedade.comentarios,
};

export type VisitaRow = NonNullable<Awaited<ReturnType<VisitasRepository["porId"]>>>;

const associacaoDaVisita = sql`coalesce(${visita.associacaoId}, ${propriedade.associacaoId})`;

/**
 * Visita + projeto + técnico + propriedade/produtor + associação. A associação é
 * a da visita inicial OU a que atende a propriedade (coalesce) — é por ela que
 * a busca por sigla e o filtro `associacaoId` alcançam as visitas na propriedade.
 */
function consulta(tx: DbOrTx) {
  return tx
    .select(colunas)
    .from(visita)
    .innerJoin(projeto, eq(projeto.id, visita.projetoId))
    .innerJoin(tecnico, eq(tecnico.id, visita.tecnicoId))
    .leftJoin(propriedade, eq(propriedade.id, visita.propriedadeId))
    .leftJoin(produtor, eq(produtor.id, propriedade.produtorId))
    .leftJoin(pessoaProdutor, eq(pessoaProdutor.id, produtor.userId))
    .leftJoin(associacao, eq(associacao.id, associacaoDaVisita));
}

function where(f: Filtros) {
  const termo = f.busca ? `%${escaparLike(f.busca)}%` : undefined;
  return and(
    isNull(visita.deletedAt),
    f.escopo ? inArray(visita.projetoId, f.escopo) : undefined,
    f.projetoId ? eq(visita.projetoId, f.projetoId) : undefined,
    f.tipo ? eq(visita.tipo, f.tipo) : undefined,
    f.situacao ? eq(visita.situacao, f.situacao) : undefined,
    f.associacaoId
      ? or(eq(visita.associacaoId, f.associacaoId), eq(propriedade.associacaoId, f.associacaoId))
      : undefined,
    f.propriedadeId ? eq(visita.propriedadeId, f.propriedadeId) : undefined,
    f.tecnicoId ? eq(visita.tecnicoId, f.tecnicoId) : undefined,
    // `data` é date: compara direto com a string YYYY-MM-DD (intervalo fechado)
    f.de ? gte(visita.data, f.de) : undefined,
    f.ate ? lte(visita.data, f.ate) : undefined,
    termo
      ? or(ilike(associacao.sigla, termo), ilike(propriedade.nome, termo), ilike(pessoaProdutor.name, termo))
      : undefined,
  );
}

export default class VisitasRepository {
  // ─── Visitas ──────────────────────────────────────────────────────────────

  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "data"];
    const direcao = sort ? (sort.direcao === "desc" ? desc : asc) : desc;
    return consulta(tx)
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(visita.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    // Mesmos joins da listagem que os filtros usam (busca e associação)
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(visita)
      .leftJoin(propriedade, eq(propriedade.id, visita.propriedadeId))
      .leftJoin(produtor, eq(produtor.id, propriedade.produtorId))
      .leftJoin(pessoaProdutor, eq(pessoaProdutor.id, produtor.userId))
      .leftJoin(associacao, eq(associacao.id, associacaoDaVisita))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  /** Visita viva e dentro do escopo (`undefined` = qualquer projeto). */
  async porId(id: string, escopo: Escopo, tx: DbOrTx = db) {
    const [row] = await consulta(tx)
      .where(and(eq(visita.id, id), where({ escopo })))
      .limit(1);
    return row;
  }

  async inserir(data: NewVisita, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(visita).values(data).returning({ id: visita.id });
    return row;
  }

  async alterar(id: string, data: Partial<NewVisita>, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(visita)
      .set(campos)
      .where(and(eq(visita.id, id), isNull(visita.deletedAt)))
      .returning({ id: visita.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(visita)
      .set({ deletedAt: new Date() })
      .where(and(eq(visita.id, id), isNull(visita.deletedAt)))
      .returning({ id: visita.id });
    return row;
  }

  /** Registros vivos que dependem da visita — impedem a exclusão. */
  async contarDependencias(id: string, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .execute<{ total: string }>(
        sql`
      select
        (select count(*) from recomendacoes
          where (visita_id = ${id} or verificada_em_visita_id = ${id}) and deleted_at is null)
      + (select count(*) from analises_solo where visita_id = ${id} and deleted_at is null)
      + (select count(*) from visitas where visita_anterior_id = ${id} and deleted_at is null)
      + (select count(*) from diagnosticos_associacao where visita_id = ${id} and deleted_at is null)
      + (select count(*) from visita_itens_verificados where visita_id = ${id} and deleted_at is null)
        as total`,
      )
      .then((r) => r.rows);
    return Number(row?.total ?? 0);
  }

  /** A associação tem adesão ATIVA (não excluída e `ativo`) ao projeto. */
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

  /**
   * Pessoas (por id) com a indicação de poderem atuar no projeto: estão na
   * equipe (linha não excluída) OU têm papel com acesso a todos os projetos.
   * Ids inexistentes simplesmente não voltam.
   */
  async pessoasNoProjeto(projetoId: string, userIds: string[], tx: DbOrTx = db) {
    if (userIds.length === 0) return [];
    const naEquipe = exists(
      tx
        .select({ um: sql`1` })
        .from(projetoEquipe)
        .where(
          and(
            eq(projetoEquipe.projetoId, projetoId),
            eq(projetoEquipe.userId, user.id),
            isNull(projetoEquipe.deletedAt),
          ),
        ),
    );
    return tx
      .select({
        id: user.id,
        nome: user.name,
        permitido: sql<boolean>`(coalesce(${papel.acessoTodosProjetos}, false) or ${naEquipe})`,
      })
      .from(user)
      .leftJoin(papel, and(eq(papel.nome, user.role), isNull(papel.deletedAt)))
      .where(inArray(user.id, userIds));
  }

  // ─── Equipe da visita ─────────────────────────────────────────────────────

  async listarEquipe(visitaId: string, tx: DbOrTx = db) {
    const rows = await tx
      .select({
        id: visitaEquipe.id,
        visitaId: visitaEquipe.visitaId,
        userId: visitaEquipe.userId,
        nome: user.name,
        email: user.email,
      })
      .from(visitaEquipe)
      .innerJoin(user, eq(user.id, visitaEquipe.userId))
      .where(and(eq(visitaEquipe.visitaId, visitaId), isNull(visitaEquipe.deletedAt)))
      .orderBy(asc(user.name), asc(visitaEquipe.id));
    return rows.map((m) => ({ ...m, email: ehEmailTecnico(m.email) ? null : m.email }));
  }

  async equipeAtual(visitaId: string, tx: DbOrTx = db): Promise<{ id: string; userId: string }[]> {
    return tx
      .select({ id: visitaEquipe.id, userId: visitaEquipe.userId })
      .from(visitaEquipe)
      .where(and(eq(visitaEquipe.visitaId, visitaId), isNull(visitaEquipe.deletedAt)));
  }

  async excluirMembros(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return;
    await tx
      .update(visitaEquipe)
      .set({ deletedAt: new Date() })
      .where(and(inArray(visitaEquipe.id, ids), isNull(visitaEquipe.deletedAt)));
  }

  async inserirMembros(visitaId: string, userIds: string[], tx: DbOrTx = db) {
    if (userIds.length === 0) return;
    await tx.insert(visitaEquipe).values(userIds.map((userId) => ({ visitaId, userId })));
  }

  // ─── Anexos ───────────────────────────────────────────────────────────────

  async listarAnexos(visitaId: string, tx: DbOrTx = db) {
    return tx
      .select(colunasAnexo)
      .from(visitaAnexo)
      .where(and(eq(visitaAnexo.visitaId, visitaId), isNull(visitaAnexo.deletedAt)))
      .orderBy(asc(visitaAnexo.createdAt), asc(visitaAnexo.id));
  }

  /** Anexo vivo da visita, com a chave do objeto no storage (uso interno). */
  async anexoPorId(visitaId: string, anexoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ ...colunasAnexo, arquivoKey: visitaAnexo.arquivoKey })
      .from(visitaAnexo)
      .where(
        and(eq(visitaAnexo.id, anexoId), eq(visitaAnexo.visitaId, visitaId), isNull(visitaAnexo.deletedAt)),
      )
      .limit(1);
    return row;
  }

  async inserirAnexo(data: NewVisitaAnexo, tx: DbOrTx = db) {
    const [row] = await tx.insert(visitaAnexo).values(data).returning(colunasAnexo);
    return row;
  }

  async excluirAnexo(anexoId: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(visitaAnexo)
      .set({ deletedAt: new Date() })
      .where(and(eq(visitaAnexo.id, anexoId), isNull(visitaAnexo.deletedAt)))
      .returning({ id: visitaAnexo.id });
    return row;
  }

  // ─── Itens verificados ────────────────────────────────────────────────────

  /** Itens conferidos na visita, com os dados da entrega e quantas fotos da visita mostram cada um. */
  async listarItensVerificados(visitaId: string, entregaId?: string, tx: DbOrTx = db) {
    const fotos = sql<number>`cast((
      select count(*) from ${visitaAnexo}
      where ${visitaAnexo.visitaId} = ${visitaItemVerificado.visitaId}
        and ${visitaAnexo.entregaId} = ${visitaItemVerificado.entregaId}
        and ${visitaAnexo.deletedAt} is null
    ) as int)`;
    return tx
      .select({
        id: visitaItemVerificado.id,
        visitaId: visitaItemVerificado.visitaId,
        entregaId: visitaItemVerificado.entregaId,
        itemDescricao: item.descricao,
        itemCategoria: item.categoria,
        quantidade: entrega.quantidade,
        lote: entrega.lote,
        dataEntrega: entrega.dataEntrega,
        observacao: visitaItemVerificado.observacao,
        fotos,
      })
      .from(visitaItemVerificado)
      .innerJoin(entrega, eq(entrega.id, visitaItemVerificado.entregaId))
      .innerJoin(item, eq(item.id, entrega.itemId))
      .where(
        and(
          eq(visitaItemVerificado.visitaId, visitaId),
          entregaId ? eq(visitaItemVerificado.entregaId, entregaId) : undefined,
          isNull(visitaItemVerificado.deletedAt),
        ),
      )
      .orderBy(asc(item.descricao), asc(visitaItemVerificado.id));
  }

  async itemVerificado(visitaId: string, entregaId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: visitaItemVerificado.id })
      .from(visitaItemVerificado)
      .where(
        and(
          eq(visitaItemVerificado.visitaId, visitaId),
          eq(visitaItemVerificado.entregaId, entregaId),
          isNull(visitaItemVerificado.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async inserirItemVerificado(
    data: { visitaId: string; entregaId: string; observacao: string | null },
    tx: DbOrTx = db,
  ) {
    await tx.insert(visitaItemVerificado).values(data);
  }

  async alterarItemVerificado(id: string, observacao: string | null, tx: DbOrTx = db) {
    await tx.update(visitaItemVerificado).set({ observacao }).where(eq(visitaItemVerificado.id, id));
  }

  async excluirItemVerificado(id: string, tx: DbOrTx = db) {
    await tx
      .update(visitaItemVerificado)
      .set({ deletedAt: new Date() })
      .where(and(eq(visitaItemVerificado.id, id), isNull(visitaItemVerificado.deletedAt)));
  }

  /** Entrega viva (de qualquer projeto — o service compara com a visita). */
  async entregaPorId(entregaId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({
        id: entrega.id,
        projetoId: entrega.projetoId,
        associacaoId: entrega.associacaoId,
        situacao: entrega.situacao,
        itemDescricao: item.descricao,
      })
      .from(entrega)
      .innerJoin(item, eq(item.id, entrega.itemId))
      .where(and(eq(entrega.id, entregaId), isNull(entrega.deletedAt)))
      .limit(1);
    return row;
  }

  // ─── Diagnóstico da propriedade ───────────────────────────────────────────

  /** Diagnóstico da visita; com `incluirExcluido`, devolve também o soft-deletado (para reativar). */
  async diagnosticoPorVisita(visitaId: string, { incluirExcluido = false } = {}, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ ...colunasDiagnostico, deletedAt: diagnosticoPropriedade.deletedAt })
      .from(diagnosticoPropriedade)
      .where(
        and(
          eq(diagnosticoPropriedade.visitaId, visitaId),
          incluirExcluido ? undefined : isNull(diagnosticoPropriedade.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async inserirDiagnostico(data: NewDiagnosticoPropriedade, tx: DbOrTx = db) {
    await tx.insert(diagnosticoPropriedade).values(data);
  }

  /** Atualiza (e reativa, se `deletedAt: null` vier nos dados) o diagnóstico da visita. */
  async alterarDiagnostico(visitaId: string, data: Partial<NewDiagnosticoPropriedade>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return;
    await tx.update(diagnosticoPropriedade).set(campos).where(eq(diagnosticoPropriedade.visitaId, visitaId));
  }

  /** Opções marcadas no diagnóstico da visita, com grupo e nome do catálogo. */
  async opcoesMarcadas(visitaId: string, tx: DbOrTx = db) {
    return tx
      .select({
        id: diagnosticoOpcao.id,
        opcaoId: diagnosticoOpcao.opcaoId,
        grupo: opcaoDiagnostico.grupo,
        nome: opcaoDiagnostico.nome,
        detalhe: diagnosticoOpcao.detalhe,
      })
      .from(diagnosticoOpcao)
      .innerJoin(opcaoDiagnostico, eq(opcaoDiagnostico.id, diagnosticoOpcao.opcaoId))
      .where(and(eq(diagnosticoOpcao.visitaId, visitaId), isNull(diagnosticoOpcao.deletedAt)))
      .orderBy(asc(opcaoDiagnostico.grupo), asc(opcaoDiagnostico.ordem), asc(opcaoDiagnostico.nome));
  }

  /** Opções do catálogo (não excluídas) pelos ids. */
  async opcoesDoCatalogo(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return [];
    return tx
      .select({
        id: opcaoDiagnostico.id,
        grupo: opcaoDiagnostico.grupo,
        nome: opcaoDiagnostico.nome,
        permiteDetalhe: opcaoDiagnostico.permiteDetalhe,
        ativo: opcaoDiagnostico.ativo,
      })
      .from(opcaoDiagnostico)
      .where(and(inArray(opcaoDiagnostico.id, ids), isNull(opcaoDiagnostico.deletedAt)));
  }

  async excluirOpcoesMarcadas(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return;
    await tx
      .update(diagnosticoOpcao)
      .set({ deletedAt: new Date() })
      .where(and(inArray(diagnosticoOpcao.id, ids), isNull(diagnosticoOpcao.deletedAt)));
  }

  async alterarDetalheOpcao(id: string, detalhe: string | null, tx: DbOrTx = db) {
    await tx.update(diagnosticoOpcao).set({ detalhe }).where(eq(diagnosticoOpcao.id, id));
  }

  async inserirOpcoesMarcadas(
    visitaId: string,
    opcoes: { opcaoId: string; detalhe: string | null }[],
    tx: DbOrTx = db,
  ) {
    if (opcoes.length === 0) return;
    await tx.insert(diagnosticoOpcao).values(opcoes.map((o) => ({ visitaId, ...o })));
  }
}
