import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto } from "../../lib/escopo.ts";
import VisitasService from "../visitas/visitas.service.ts";
import RecomendacoesRepository from "./recomendacoes.repository.ts";
import type {
  ListRecomendacoesQuerySchema,
  CreateRecomendacaoSchema,
  UpdateRecomendacaoSchema,
} from "./recomendacoes.schema.ts";

type ListQuery = z.infer<typeof ListRecomendacoesQuerySchema>;
type CreateData = z.infer<typeof CreateRecomendacaoSchema>;
type UpdateData = z.infer<typeof UpdateRecomendacaoSchema>;

export default class RecomendacoesService {
  private repository = new RecomendacoesRepository();
  private visitas = new VisitasService();

  async listar(query: ListQuery) {
    if (query.projetoId) await garantirProjeto(query.projetoId);
    const filtros = { ...query, escopo: await escopoAtual() };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    return this.buscar(id);
  }

  async criar({ visitaId, ...data }: CreateData) {
    // Visita fora do escopo → 404 (buscar); projeto encerrado → 409
    const origem = await this.visitas.buscar(visitaId);
    await garantirProjeto(origem.projetoId, { escrita: true });
    if (origem.tipo !== "assistencia_tecnica" || !origem.propriedadeId) {
      throw new AppError(
        "Recomendações são registradas em visitas de assistência técnica",
        422,
        undefined,
        "TIPO_VISITA_INVALIDO",
      );
    }
    if (data.verificadaEmVisitaId) {
      await this.garantirVerificacao(data.verificadaEmVisitaId, origem.projetoId, origem.propriedadeId);
    }
    const { id } = await this.repository.inserir({
      ...data,
      visitaId,
      // A propriedade vem da visita — nunca do corpo
      propriedadeId: origem.propriedadeId,
    });
    return this.buscar(id);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if (data.verificadaEmVisitaId && data.verificadaEmVisitaId !== atual.verificadaEmVisitaId) {
      await this.garantirVerificacao(data.verificadaEmVisitaId, atual.projetoId, atual.propriedadeId);
    }
    const alterada = await this.repository.alterar(id, data);
    if (!alterada) throw new AppError("Recomendação não encontrada", 404);
    return this.buscar(id);
  }

  async excluir(id: string) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Recomendação não encontrada", 404);
  }

  private async buscar(id: string) {
    const recomendacao = await this.repository.porId(id, await escopoAtual());
    if (!recomendacao) throw new AppError("Recomendação não encontrada", 404);
    return recomendacao;
  }

  /** Quem verifica a adoção é uma visita de acompanhamento na MESMA propriedade e no MESMO projeto. */
  private async garantirVerificacao(verificadaEmVisitaId: string, projetoId: string, propriedadeId: string) {
    const verificacao = await this.visitas.buscar(verificadaEmVisitaId).catch((err: unknown) => {
      if (err instanceof AppError && err.statusCode === 404) {
        throw new AppError("Visita de verificação não encontrada", 404);
      }
      throw err;
    });
    if (
      verificacao.tipo !== "acompanhamento" ||
      verificacao.projetoId !== projetoId ||
      verificacao.propriedadeId !== propriedadeId
    ) {
      throw new AppError(
        "A verificação precisa ser uma visita de acompanhamento na mesma propriedade e no mesmo projeto",
        422,
        undefined,
        "VERIFICACAO_INVALIDA",
      );
    }
  }
}
