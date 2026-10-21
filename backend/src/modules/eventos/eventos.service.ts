import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirAssociacao, garantirProjeto, noEscopo } from "../../lib/escopo.ts";
import EventosRepository from "./eventos.repository.ts";
import {
  MENSAGEM_PERIODO,
  type ListEventosQuerySchema,
  type CreateEventoSchema,
  type UpdateEventoSchema,
  type PutParticipantesSchema,
} from "./eventos.schema.ts";

type ListQuery = z.infer<typeof ListEventosQuerySchema>;
type CreateData = z.infer<typeof CreateEventoSchema>;
type UpdateData = z.infer<typeof UpdateEventoSchema>;
type PutParticipantes = z.infer<typeof PutParticipantesSchema>;

const GRUPO_TEMA = "tema_capacitacao";

export default class EventosService {
  private repository = new EventosRepository();

  async listar({ projetoId, ...query }: ListQuery) {
    if (projetoId) await garantirProjeto(projetoId);
    const escopo = await escopoAtual();
    const filtros = { ...query, projetoId, escopo };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    return this.buscar(id);
  }

  async criar({ projetoId, inicio, fim, ...data }: CreateData) {
    await garantirProjeto(projetoId, { escrita: true });
    await this.validarReferencias(projetoId, data);
    const { id } = await this.repository.inserir({
      projetoId,
      ...data,
      inicio: new Date(inicio),
      fim: new Date(fim),
    });
    return this.buscar(id);
  }

  async alterar(id: string, { inicio, fim, ...data }: UpdateData) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });

    const novoInicio = inicio ? new Date(inicio) : atual.inicio;
    const novoFim = fim ? new Date(fim) : atual.fim;
    if (novoFim < novoInicio) throw new AppError(MENSAGEM_PERIODO, 400);

    // Só revalida a referência que mudou — uma opção desativada depois não trava a edição do resto
    await this.validarReferencias(atual.projetoId, {
      temaId: data.temaId !== atual.temaId ? data.temaId : undefined,
      associacaoId: data.associacaoId !== atual.associacaoId ? data.associacaoId : undefined,
      municipioId: data.municipioId !== atual.municipioId ? data.municipioId : undefined,
    });

    const alterado = await this.repository.alterar(id, {
      ...data,
      inicio: inicio ? novoInicio : undefined,
      fim: fim ? novoFim : undefined,
    });
    if (!alterado) throw new AppError("Evento não encontrado", 404);
    return this.buscar(id);
  }

  async excluir(id: string) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Evento não encontrado", 404);
  }

  // ─── Participantes ────────────────────────────────────────────────────────

  async listarParticipantes(id: string) {
    await this.buscar(id);
    return this.repository.listarParticipantes(id);
  }

  /**
   * Substitui a lista de presença: quem saiu é excluído (soft delete), quem
   * entrou é inserido e quem ficou só tem a presença atualizada — numa transação.
   */
  async substituirParticipantes(id: string, { participantes }: PutParticipantes) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    await this.garantirProdutores(participantes.map((p) => p.produtorId));

    await db.transaction(async (tx) => {
      const existentes = await this.repository.participantesAtuais(id, tx);
      const porProdutor = new Map(existentes.map((e) => [e.produtorId, e]));
      const desejados = new Set(participantes.map((p) => p.produtorId));

      const sairam = existentes.filter((e) => !desejados.has(e.produtorId)).map((e) => e.id);
      const novos = participantes.filter((p) => !porProdutor.has(p.produtorId));
      const marcarPresente: string[] = [];
      const marcarAusente: string[] = [];
      for (const p of participantes) {
        const e = porProdutor.get(p.produtorId);
        if (e && e.presente !== p.presente) (p.presente ? marcarPresente : marcarAusente).push(e.id);
      }

      await this.repository.excluirParticipantes(sairam, tx);
      await this.repository.marcarPresenca(marcarPresente, true, tx);
      await this.repository.marcarPresenca(marcarAusente, false, tx);
      await this.repository.inserirParticipantes(
        novos.map((p) => ({ eventoId: id, produtorId: p.produtorId, presente: p.presente })),
        tx,
      );
    });

    return this.repository.listarParticipantes(id);
  }

  // ─── Auxiliares ───────────────────────────────────────────────────────────

  /** Evento existe, não foi excluído e é de um projeto do escopo — 404 caso contrário. */
  private async buscar(id: string) {
    const [escopo, evento] = await Promise.all([escopoAtual(), this.repository.porId(id)]);
    if (!evento || !noEscopo(escopo, evento.projetoId)) {
      throw new AppError("Evento não encontrado", 404);
    }
    return evento;
  }

  private async validarReferencias(
    projetoId: string,
    {
      temaId,
      associacaoId,
      municipioId,
    }: { temaId?: string | null; associacaoId?: string | null; municipioId?: number },
  ) {
    if (temaId) {
      const tema = await this.repository.temaPorId(temaId);
      if (!tema) throw new AppError("Tema não encontrado", 404);
      if (tema.grupo !== GRUPO_TEMA) {
        throw new AppError("A opção informada não é um tema de capacitação", 422, undefined, "TEMA_INVALIDO");
      }
      if (!tema.ativo) {
        throw new AppError("O tema de capacitação informado está inativo", 422, undefined, "TEMA_INATIVO");
      }
    }
    if (associacaoId) {
      const assoc = await garantirAssociacao(associacaoId);
      if (!(await this.repository.temAdesaoAtiva(projetoId, associacaoId))) {
        throw new AppError(
          `${assoc.sigla} não tem adesão ativa a este projeto`,
          422,
          undefined,
          "ASSOCIACAO_SEM_ADESAO",
        );
      }
    }
    if (municipioId !== undefined && !(await this.repository.municipioExiste(municipioId))) {
      throw new AppError("Município não encontrado", 404);
    }
  }

  /** Cada produtor existe (404) e está ativo (422). */
  private async garantirProdutores(ids: string[]) {
    const encontrados = await this.repository.produtoresPorIds(ids);
    const porId = new Map(encontrados.map((p) => [p.id, p]));
    if (ids.some((id) => !porId.has(id))) throw new AppError("Produtor não encontrado", 404);
    const inativo = encontrados.find((p) => !p.ativo);
    if (inativo) {
      throw new AppError(`${inativo.nome} está inativo no projeto`, 422, undefined, "PRODUTOR_INATIVO");
    }
  }
}
