import { and, asc, desc, eq, exists, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, escaparLike, type DbOrTx } from "../../db/index.ts";
import { associacao, type NewAssociacao } from "../../db/associacao.ts";
import { associacaoContato, type NewAssociacaoContato } from "../../db/associacaoContato.ts";
import { associacaoDocumento, type NewAssociacaoDocumento } from "../../db/associacaoDocumento.ts";
import { tipoDocumento } from "../../db/tipoDocumento.ts";
import { projetoAssociacao } from "../../db/projetoAssociacao.ts";
import { projeto } from "../../db/projeto.ts";
import { municipio } from "../../db/municipio.ts";
import { estado } from "../../db/estado.ts";
import { propriedade } from "../../db/propriedade.ts";
import { visita } from "../../db/visita.ts";
import { user } from "../../db/user.ts";
import { diagnosticoAssociacao, type NewDiagnosticoAssociacao } from "../../db/diagnosticoAssociacao.ts";
import { diagnosticoOpcao } from "../../db/diagnosticoOpcao.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { camposParaAtualizar } from "../../lib/update.ts";
import { ehEmailTecnico } from "../../lib/documentos.ts";
import type { Escopo } from "../../lib/escopo.ts";
import type { Sort } from "../../lib/openapi/helpers.ts";
import { associacaoNoEscopo } from "../projetos/projetos.repository.ts";

// Allowlist de ordenação: campo da query → coluna Drizzle (nunca interpole nomes)
const SORT_COLUMNS = {
  sigla: associacao.sigla,
  nome: associacao.nome,
  municipio: municipio.nome,
  numProdutores: associacao.numProdutores,
  createdAt: associacao.createdAt,
} as const;

type Filtros = { busca?: string; municipioId?: number; projetoId?: string; ativo?: boolean; escopo?: Escopo };
type ListParams = Filtros & {
  limit: number;
  offset: number;
  sort?: Sort<keyof typeof SORT_COLUMNS & string>;
};

const colunas = {
  id: associacao.id,
  sigla: associacao.sigla,
  nome: associacao.nome,
  cnpj: associacao.cnpj,
  municipioId: associacao.municipioId,
  municipioNome: municipio.nome,
  uf: estado.sigla,
  distrito: associacao.distrito,
  endereco: associacao.endereco,
  numProdutores: associacao.numProdutores,
  numFamilias: associacao.numFamilias,
  areaMediaHa: associacao.areaMediaHa,
  latitude: associacao.latitude,
  longitude: associacao.longitude,
  mapaUrl: associacao.mapaUrl,
  grupoWhatsappUrl: associacao.grupoWhatsappUrl,
  dadosRevisados: associacao.dadosRevisados,
  ativo: associacao.ativo,
};

const colunasContato = {
  id: associacaoContato.id,
  associacaoId: associacaoContato.associacaoId,
  userId: associacaoContato.userId,
  nome: user.name,
  email: user.email,
  telefone: user.phoneNumber,
  funcao: associacaoContato.funcao,
  principal: associacaoContato.principal,
  desde: associacaoContato.desde,
  ate: associacaoContato.ate,
};

const colunasDocumento = {
  id: associacaoDocumento.id,
  associacaoId: associacaoDocumento.associacaoId,
  tipoDocumentoId: associacaoDocumento.tipoDocumentoId,
  tipoDocumento: tipoDocumento.nome,
  projetoId: associacaoDocumento.projetoId,
  projetoSigla: projeto.sigla,
  situacao: associacaoDocumento.situacao,
  arquivoKey: associacaoDocumento.arquivoKey,
  nomeArquivo: associacaoDocumento.nomeArquivo,
  mimeType: associacaoDocumento.mimeType,
  tamanhoBytes: associacaoDocumento.tamanhoBytes,
  validade: associacaoDocumento.validade,
  observacao: associacaoDocumento.observacao,
  // Tabela qualificada à mão: dentro da subquery um "id" solto seria o da assinatura
  temAssinatura: sql<boolean>`exists (
    select 1 from assinaturas a
    where a.associacao_documento_id = associacao_documentos.id and a.deleted_at is null
  )`,
};

const colunasDiagnostico = {
  associacaoId: diagnosticoAssociacao.associacaoId,
  visitaId: diagnosticoAssociacao.visitaId,
  coletadoEm: diagnosticoAssociacao.coletadoEm,
  analiseSoloRecente: diagnosticoAssociacao.analiseSoloRecente,
  acessoMaquinario: diagnosticoAssociacao.acessoMaquinario,
  praticasConservacao: diagnosticoAssociacao.praticasConservacao,
  participouCursos: diagnosticoAssociacao.participouCursos,
  interesseCapacitacao: diagnosticoAssociacao.interesseCapacitacao,
  possuiRegistroFormal: diagnosticoAssociacao.possuiRegistroFormal,
  possuiLocalEventos: diagnosticoAssociacao.possuiLocalEventos,
  tipoLocalEventos: diagnosticoAssociacao.tipoLocalEventos,
  potencialNaoExplorado: diagnosticoAssociacao.potencialNaoExplorado,
  comentarios: diagnosticoAssociacao.comentarios,
  revisado: diagnosticoAssociacao.revisado,
};

/** O arquivo é privado: a key nunca sai da API — só se existe. */
type DocumentoRow = Awaited<ReturnType<AssociacoesRepository["documentoPorId"]>>;
const paraDocumento = ({ arquivoKey, ...d }: NonNullable<DocumentoRow>) => ({
  ...d,
  temArquivo: Boolean(arquivoKey),
});
const semEmailTecnico = <T extends { email: string | null }>(c: T): T => ({
  ...c,
  email: c.email && ehEmailTecnico(c.email) ? null : c.email,
});

function where({ busca, municipioId, projetoId, ativo, escopo }: Filtros) {
  const termo = busca ? `%${escaparLike(busca)}%` : undefined;
  return and(
    isNull(associacao.deletedAt),
    termo
      ? or(ilike(associacao.sigla, termo), ilike(associacao.nome, termo), ilike(associacao.cnpj, termo))
      : undefined,
    municipioId ? eq(associacao.municipioId, municipioId) : undefined,
    ativo !== undefined ? eq(associacao.ativo, ativo) : undefined,
    projetoId
      ? exists(
          db
            .select({ um: sql`1` })
            .from(projetoAssociacao)
            .where(
              and(
                eq(projetoAssociacao.associacaoId, associacao.id),
                eq(projetoAssociacao.projetoId, projetoId),
                isNull(projetoAssociacao.deletedAt),
              ),
            ),
        )
      : undefined,
    associacaoNoEscopo(escopo),
  );
}

export default class AssociacoesRepository {
  // ─── Associações ──────────────────────────────────────────────────────────

  async listar({ limit, offset, sort, ...filtros }: ListParams, tx: DbOrTx = db) {
    const coluna = SORT_COLUMNS[sort?.campo ?? "sigla"];
    const direcao = sort?.direcao === "desc" ? desc : asc;
    return tx
      .select(colunas)
      .from(associacao)
      .innerJoin(municipio, eq(municipio.id, associacao.municipioId))
      .innerJoin(estado, eq(estado.id, municipio.estadoId))
      .where(where(filtros))
      .orderBy(direcao(coluna), asc(associacao.id))
      .limit(limit)
      .offset(offset);
  }

  async contar(filtros: Filtros, tx: DbOrTx = db): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(associacao)
      .innerJoin(municipio, eq(municipio.id, associacao.municipioId))
      .where(where(filtros));
    return row?.total ?? 0;
  }

  async porId(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunas)
      .from(associacao)
      .innerJoin(municipio, eq(municipio.id, associacao.municipioId))
      .innerJoin(estado, eq(estado.id, municipio.estadoId))
      .where(and(eq(associacao.id, id), isNull(associacao.deletedAt)))
      .limit(1);
    return row;
  }

  async municipioExiste(municipioId: number, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: municipio.id })
      .from(municipio)
      .where(eq(municipio.id, municipioId))
      .limit(1);
    return Boolean(row);
  }

  /** Mesma sigla (sem caixa) no mesmo município, entre as não excluídas. */
  async porSiglaNoMunicipio(sigla: string, municipioId: number, ignorarId?: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: associacao.id })
      .from(associacao)
      .where(
        and(
          sql`lower(${associacao.sigla}) = lower(${sigla})`,
          eq(associacao.municipioId, municipioId),
          isNull(associacao.deletedAt),
          ignorarId ? ne(associacao.id, ignorarId) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  async porCnpj(cnpj: string, ignorarId?: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: associacao.id, sigla: associacao.sigla })
      .from(associacao)
      .where(
        and(
          eq(associacao.cnpj, cnpj),
          isNull(associacao.deletedAt),
          ignorarId ? ne(associacao.id, ignorarId) : undefined,
        ),
      )
      .limit(1);
    return row;
  }

  async inserir(data: NewAssociacao, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(associacao).values(data).returning({ id: associacao.id });
    return row;
  }

  async inserirAdesao(projetoId: string, associacaoId: string, tx: DbOrTx = db) {
    await tx.insert(projetoAssociacao).values({ projetoId, associacaoId, aderiuEm: sql`current_date` });
  }

  async alterar(id: string, data: Partial<NewAssociacao>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id };
    const [row] = await tx
      .update(associacao)
      .set(campos)
      .where(and(eq(associacao.id, id), isNull(associacao.deletedAt)))
      .returning({ id: associacao.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(associacao)
      .set({ deletedAt: new Date() })
      .where(and(eq(associacao.id, id), isNull(associacao.deletedAt)))
      .returning({ id: associacao.id });
    return row;
  }

  async contarVinculos(id: string, tx: DbOrTx = db) {
    const [p] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(propriedade)
      .where(and(eq(propriedade.associacaoId, id), isNull(propriedade.deletedAt)));
    const [a] = await tx
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(projetoAssociacao)
      .where(and(eq(projetoAssociacao.associacaoId, id), isNull(projetoAssociacao.deletedAt)));
    return { propriedades: p?.total ?? 0, adesoes: a?.total ?? 0 };
  }

  /** A associação tem adesão (não excluída) a este projeto? */
  async temAdesao(associacaoId: string, projetoId: string, tx: DbOrTx = db): Promise<boolean> {
    const [row] = await tx
      .select({ id: projetoAssociacao.id })
      .from(projetoAssociacao)
      .where(
        and(
          eq(projetoAssociacao.associacaoId, associacaoId),
          eq(projetoAssociacao.projetoId, projetoId),
          isNull(projetoAssociacao.deletedAt),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  // ─── Contatos ─────────────────────────────────────────────────────────────

  async listarContatos(associacaoId: string, tx: DbOrTx = db) {
    const rows = await tx
      .select(colunasContato)
      .from(associacaoContato)
      .innerJoin(user, eq(user.id, associacaoContato.userId))
      .where(and(eq(associacaoContato.associacaoId, associacaoId), isNull(associacaoContato.deletedAt)))
      .orderBy(desc(associacaoContato.principal), asc(associacaoContato.funcao), asc(user.name));
    return rows.map(semEmailTecnico);
  }

  async contatoPorId(associacaoId: string, contatoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunasContato)
      .from(associacaoContato)
      .innerJoin(user, eq(user.id, associacaoContato.userId))
      .where(
        and(
          eq(associacaoContato.id, contatoId),
          eq(associacaoContato.associacaoId, associacaoId),
          isNull(associacaoContato.deletedAt),
        ),
      )
      .limit(1);
    return row ? semEmailTecnico(row) : undefined;
  }

  async contatoPorUsuario(associacaoId: string, userId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: associacaoContato.id })
      .from(associacaoContato)
      .where(
        and(
          eq(associacaoContato.associacaoId, associacaoId),
          eq(associacaoContato.userId, userId),
          isNull(associacaoContato.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  /** Antes de marcar um contato como principal — o índice permite um só. */
  async desmarcarPrincipal(associacaoId: string, tx: DbOrTx = db) {
    await tx
      .update(associacaoContato)
      .set({ principal: false })
      .where(
        and(
          eq(associacaoContato.associacaoId, associacaoId),
          eq(associacaoContato.principal, true),
          isNull(associacaoContato.deletedAt),
        ),
      );
  }

  async inserirContato(data: NewAssociacaoContato, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(associacaoContato).values(data).returning({ id: associacaoContato.id });
    return row;
  }

  async alterarContato(contatoId: string, data: Partial<NewAssociacaoContato>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id: contatoId };
    const [row] = await tx
      .update(associacaoContato)
      .set(campos)
      .where(and(eq(associacaoContato.id, contatoId), isNull(associacaoContato.deletedAt)))
      .returning({ id: associacaoContato.id });
    return row;
  }

  async excluirContato(contatoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .update(associacaoContato)
      .set({ deletedAt: new Date() })
      .where(and(eq(associacaoContato.id, contatoId), isNull(associacaoContato.deletedAt)))
      .returning({ id: associacaoContato.id });
    return row;
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  /** Documentos da associação; os por projeto, só dos projetos do escopo. */
  async listarDocumentos(associacaoId: string, escopo: Escopo, tx: DbOrTx = db) {
    const rows = await tx
      .select(colunasDocumento)
      .from(associacaoDocumento)
      .innerJoin(tipoDocumento, eq(tipoDocumento.id, associacaoDocumento.tipoDocumentoId))
      .leftJoin(projeto, eq(projeto.id, associacaoDocumento.projetoId))
      .where(
        and(
          eq(associacaoDocumento.associacaoId, associacaoId),
          isNull(associacaoDocumento.deletedAt),
          escopo
            ? or(isNull(associacaoDocumento.projetoId), inArray(associacaoDocumento.projetoId, escopo))
            : undefined,
        ),
      )
      .orderBy(asc(tipoDocumento.ordem), asc(tipoDocumento.nome), asc(projeto.sigla));
    return rows.map(paraDocumento);
  }

  async documentoPorId(associacaoId: string, documentoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunasDocumento)
      .from(associacaoDocumento)
      .innerJoin(tipoDocumento, eq(tipoDocumento.id, associacaoDocumento.tipoDocumentoId))
      .leftJoin(projeto, eq(projeto.id, associacaoDocumento.projetoId))
      .where(
        and(
          eq(associacaoDocumento.id, documentoId),
          eq(associacaoDocumento.associacaoId, associacaoId),
          isNull(associacaoDocumento.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  documentoPublico = paraDocumento;

  async tipoDocumentoAtivo(id: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: tipoDocumento.id, nome: tipoDocumento.nome, porProjeto: tipoDocumento.porProjeto })
      .from(tipoDocumento)
      .where(and(eq(tipoDocumento.id, id), eq(tipoDocumento.ativo, true), isNull(tipoDocumento.deletedAt)))
      .limit(1);
    return row;
  }

  async documentoVigente(
    associacaoId: string,
    tipoDocumentoId: string,
    projetoId: string | null,
    tx: DbOrTx = db,
  ) {
    const [row] = await tx
      .select({ id: associacaoDocumento.id })
      .from(associacaoDocumento)
      .where(
        and(
          eq(associacaoDocumento.associacaoId, associacaoId),
          eq(associacaoDocumento.tipoDocumentoId, tipoDocumentoId),
          projetoId ? eq(associacaoDocumento.projetoId, projetoId) : isNull(associacaoDocumento.projetoId),
          isNull(associacaoDocumento.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async inserirDocumento(data: NewAssociacaoDocumento, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(associacaoDocumento).values(data).returning({ id: associacaoDocumento.id });
    return row;
  }

  async alterarDocumento(documentoId: string, data: Partial<NewAssociacaoDocumento>, tx: DbOrTx = db) {
    const campos = camposParaAtualizar(data);
    if (Object.keys(campos).length === 0) return { id: documentoId };
    const [row] = await tx
      .update(associacaoDocumento)
      .set(campos)
      .where(and(eq(associacaoDocumento.id, documentoId), isNull(associacaoDocumento.deletedAt)))
      .returning({ id: associacaoDocumento.id });
    return row;
  }

  async excluirDocumento(documentoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .update(associacaoDocumento)
      .set({ deletedAt: new Date() })
      .where(and(eq(associacaoDocumento.id, documentoId), isNull(associacaoDocumento.deletedAt)))
      .returning({ id: associacaoDocumento.id });
    return row;
  }

  // ─── Diagnóstico ──────────────────────────────────────────────────────────

  async diagnostico(associacaoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select(colunasDiagnostico)
      .from(diagnosticoAssociacao)
      .where(
        and(eq(diagnosticoAssociacao.associacaoId, associacaoId), isNull(diagnosticoAssociacao.deletedAt)),
      )
      .limit(1);
    return row;
  }

  async opcoesDoDiagnostico(associacaoId: string, tx: DbOrTx = db) {
    return tx
      .select({
        opcaoId: diagnosticoOpcao.opcaoId,
        grupo: opcaoDiagnostico.grupo,
        nome: opcaoDiagnostico.nome,
        detalhe: diagnosticoOpcao.detalhe,
      })
      .from(diagnosticoOpcao)
      .innerJoin(opcaoDiagnostico, eq(opcaoDiagnostico.id, diagnosticoOpcao.opcaoId))
      .where(and(eq(diagnosticoOpcao.associacaoId, associacaoId), isNull(diagnosticoOpcao.deletedAt)))
      .orderBy(asc(opcaoDiagnostico.grupo), asc(opcaoDiagnostico.ordem), asc(opcaoDiagnostico.nome));
  }

  async opcoesAtivas(ids: string[], tx: DbOrTx = db) {
    if (ids.length === 0) return [];
    return tx
      .select({
        id: opcaoDiagnostico.id,
        nome: opcaoDiagnostico.nome,
        permiteDetalhe: opcaoDiagnostico.permiteDetalhe,
      })
      .from(opcaoDiagnostico)
      .where(
        and(
          inArray(opcaoDiagnostico.id, ids),
          eq(opcaoDiagnostico.ativo, true),
          isNull(opcaoDiagnostico.deletedAt),
        ),
      );
  }

  async visitaInicialDaAssociacao(visitaId: string, associacaoId: string, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ id: visita.id, projetoId: visita.projetoId })
      .from(visita)
      .where(
        and(
          eq(visita.id, visitaId),
          eq(visita.associacaoId, associacaoId),
          eq(visita.tipo, "inicial_associacao"),
          isNull(visita.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }

  /**
   * Upsert do diagnóstico (PK = associação). Um diagnóstico excluído é
   * reativado com os dados novos — o histórico guarda a versão anterior.
   */
  async salvarDiagnostico(data: NewDiagnosticoAssociacao, tx: DbOrTx = db) {
    const { associacaoId: _associacaoId, ...campos } = data;
    await tx
      .insert(diagnosticoAssociacao)
      .values(data)
      .onConflictDoUpdate({
        target: diagnosticoAssociacao.associacaoId,
        set: { ...campos, deletedAt: null },
      });
  }

  /** Substitui as opções marcadas: soft delete das atuais + inserção das novas (auditável). */
  async substituirOpcoes(
    associacaoId: string,
    opcoes: { opcaoId: string; detalhe: string | null }[],
    tx: DbOrTx = db,
  ) {
    await tx
      .update(diagnosticoOpcao)
      .set({ deletedAt: new Date() })
      .where(and(eq(diagnosticoOpcao.associacaoId, associacaoId), isNull(diagnosticoOpcao.deletedAt)));
    if (opcoes.length > 0) {
      await tx.insert(diagnosticoOpcao).values(opcoes.map((o) => ({ associacaoId, ...o })));
    }
  }
}
