import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto, noEscopo } from "../../lib/escopo.ts";
import LancamentosRepository from "./lancamentos.repository.ts";
import type {
  ListLancamentosQuerySchema,
  CreateLancamentoSchema,
  UpdateLancamentoSchema,
} from "./lancamentos.schema.ts";

type ListQuery = z.infer<typeof ListLancamentosQuerySchema>;

export default class LancamentosService {
  private repository = new LancamentosRepository();

  async listar({ limit, offset, sort, ...filtros }: ListQuery) {
    // Projeto informado fora do escopo → 404; sem projeto, só os do escopo
    if (filtros.projetoId) await garantirProjeto(filtros.projetoId);
    const comEscopo = { ...filtros, escopo: await escopoAtual() };
    const [itens, { total, ...totais }] = await Promise.all([
      this.repository.listar({ ...comEscopo, limit, offset, sort }),
      this.repository.totais(comEscopo),
    ]);
    return { itens, total, totais };
  }

  async listarPorId(id: string) {
    return this.buscar(id);
  }

  async criar({ projetoId, ...data }: z.infer<typeof CreateLancamentoSchema>) {
    await garantirProjeto(projetoId, { escrita: true });
    if (data.metaId) await this.garantirMetaDoProjeto(data.metaId, projetoId);
    const { id } = await this.repository.inserir({ projetoId, ...data });
    return this.buscar(id);
  }

  async alterar(id: string, data: z.infer<typeof UpdateLancamentoSchema>) {
    const atual = await this.buscar(id, { escrita: true });
    if (data.metaId) await this.garantirMetaDoProjeto(data.metaId, atual.projetoId);
    const alterado = await this.repository.alterar(id, data);
    if (!alterado) throw new AppError("Lançamento não encontrado", 404);
    return this.buscar(id);
  }

  async excluir(id: string) {
    await this.buscar(id, { escrita: true });
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Lançamento não encontrado", 404);
  }

  /** Lançamento vivo e no escopo (404); com `escrita`, projeto não encerrado (409). */
  private async buscar(id: string, { escrita = false } = {}) {
    const lancamento = await this.repository.porId(id);
    if (!lancamento || !noEscopo(await escopoAtual(), lancamento.projetoId)) {
      throw new AppError("Lançamento não encontrado", 404);
    }
    if (escrita) await garantirProjeto(lancamento.projetoId, { escrita });
    return lancamento;
  }

  private async garantirMetaDoProjeto(metaId: string, projetoId: string) {
    if ((await this.repository.projetoDaMeta(metaId)) !== projetoId) {
      throw new AppError("A meta informada não é deste projeto", 422, undefined, "META_DE_OUTRO_PROJETO");
    }
  }
}
