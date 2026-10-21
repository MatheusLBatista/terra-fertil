import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto, garantirPropriedade } from "../../lib/escopo.ts";
import AnalisesSoloRepository from "./analisesSolo.repository.ts";
import type {
  ListAnalisesSoloQuerySchema,
  CreateAnaliseSoloSchema,
  UpdateAnaliseSoloSchema,
  LaudoSchema,
} from "./analisesSolo.schema.ts";

type ListQuery = z.infer<typeof ListAnalisesSoloQuerySchema>;
type CreateData = z.infer<typeof CreateAnaliseSoloSchema>;
type UpdateData = z.infer<typeof UpdateAnaliseSoloSchema>;
type LaudoData = z.infer<typeof LaudoSchema>;

/**
 * "Hoje" no fuso de operação do projeto (Rondônia, UTC-4) — o servidor roda em
 * UTC e, à noite, a data UTC já seria a de amanhã.
 */
const FUSO_OPERACAO = "America/Porto_Velho";
export const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_OPERACAO }).format(new Date());

export default class AnalisesSoloService {
  private repository = new AnalisesSoloRepository();

  async listar(query: ListQuery) {
    if (query.projetoId) await garantirProjeto(query.projetoId);
    const escopo = await escopoAtual();
    const filtros = { ...query, escopo };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const analise = await this.repository.porId(id, await escopoAtual());
    if (!analise) throw new AppError("Análise de solo não encontrada", 404);
    return analise;
  }

  async criar({ id, projetoId, propriedadeId, visitaId, laudoUrl, laudoRegistradoEm, ...data }: CreateData) {
    await garantirProjeto(projetoId, { escrita: true });
    await this.garantirPropriedadeNoProjeto(projetoId, propriedadeId);
    if (visitaId) await this.garantirVisita(visitaId, projetoId, propriedadeId);
    if (id && (await this.repository.idExiste(id))) {
      throw new AppError("Esta análise de solo já foi registrada", 409, undefined, "ANALISE_DUPLICADA");
    }
    const laudo = laudoUrl
      ? { laudoUrl, laudoRegistradoEm: laudoRegistradoEm ?? hoje() }
      : { laudoUrl: null, laudoRegistradoEm: null };
    const criada = await this.repository.inserir({
      id,
      projetoId,
      propriedadeId,
      visitaId: visitaId ?? null,
      ...data,
      ...laudo,
    });
    return this.listarPorId(criada.id);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });

    const propriedadeId = data.propriedadeId ?? atual.propriedadeId;
    if (propriedadeId !== atual.propriedadeId) {
      await this.garantirPropriedadeNoProjeto(atual.projetoId, propriedadeId);
    }
    const visitaId = data.visitaId !== undefined ? data.visitaId : atual.visitaId;
    if (visitaId && (visitaId !== atual.visitaId || propriedadeId !== atual.propriedadeId)) {
      await this.garantirVisita(visitaId, atual.projetoId, propriedadeId);
    }

    const laudo = this.resolverLaudo(atual, data);
    const alterada = await this.repository.alterar(id, { ...data, ...laudo });
    if (!alterada) throw new AppError("Análise de solo não encontrada", 404);
    return this.listarPorId(id);
  }

  /** PUT do laudo: grava o link (data padrão = hoje) ou, com `laudoUrl: null`, remove os dois. */
  async registrarLaudo(id: string, { laudoUrl, laudoRegistradoEm }: LaudoData) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const laudo = laudoUrl
      ? { laudoUrl, laudoRegistradoEm: laudoRegistradoEm ?? hoje() }
      : { laudoUrl: null, laudoRegistradoEm: null };
    const alterada = await this.repository.alterar(id, laudo);
    if (!alterada) throw new AppError("Análise de solo não encontrada", 404);
    return this.listarPorId(id);
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Análise de solo não encontrada", 404);
  }

  /**
   * Link e data andam juntos: link novo sem data → hoje; `laudoUrl: null` limpa a
   * data; data sem link (nem no payload nem no registro) → 400.
   */
  private resolverLaudo(
    atual: { laudoUrl: string | null; laudoRegistradoEm: string | null },
    data: UpdateData,
  ): { laudoUrl?: string | null; laudoRegistradoEm?: string | null } {
    if (data.laudoUrl === undefined && data.laudoRegistradoEm === undefined) return {};
    if (data.laudoUrl === null) return { laudoUrl: null, laudoRegistradoEm: null };

    const laudoUrl = data.laudoUrl ?? atual.laudoUrl;
    if (!laudoUrl) {
      throw new AppError("A data do laudo só pode ser informada junto com o link", 400);
    }
    if (data.laudoRegistradoEm === null) {
      throw new AppError("Para tirar a data do laudo, remova também o link", 400);
    }
    const mesmaUrl = laudoUrl === atual.laudoUrl;
    const laudoRegistradoEm = data.laudoRegistradoEm ?? (mesmaUrl ? atual.laudoRegistradoEm : null) ?? hoje();
    return { laudoUrl, laudoRegistradoEm };
  }

  /** Propriedade visível (404) cuja associação tem adesão ATIVA ao projeto (422). */
  private async garantirPropriedadeNoProjeto(projetoId: string, propriedadeId: string) {
    const propriedade = await garantirPropriedade(propriedadeId);
    if (!(await this.repository.adesaoAtiva(projetoId, propriedade.associacaoId))) {
      throw new AppError(
        "A associação desta propriedade não tem adesão ativa ao projeto",
        422,
        undefined,
        "SEM_ADESAO_ATIVA",
      );
    }
    return propriedade;
  }

  /** Visita viva, da MESMA propriedade e do MESMO projeto (422 caso contrário). */
  private async garantirVisita(visitaId: string, projetoId: string, propriedadeId: string) {
    const v = await this.repository.visitaPorId(visitaId);
    if (!v || v.projetoId !== projetoId || v.propriedadeId !== propriedadeId) {
      throw new AppError(
        "A visita informada não é desta propriedade neste projeto",
        422,
        undefined,
        "VISITA_INCOMPATIVEL",
      );
    }
  }
}
