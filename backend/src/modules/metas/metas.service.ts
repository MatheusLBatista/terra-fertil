import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto, noEscopo } from "../../lib/escopo.ts";
import MetasRepository, { type EtapaRow, type MetaRow } from "./metas.repository.ts";
import {
  CHAVES_APURACAO,
  LISTA_CHAVES,
  apurarMetas,
  ehChaveApuracao,
  type ChaveApuracao,
  type ValoresApurados,
} from "./apuracao.ts";
import type {
  CreateMetaSchema,
  UpdateMetaSchema,
  CreateIndicadorSchema,
  UpdateIndicadorSchema,
  CreateEtapaSchema,
  UpdateEtapaSchema,
} from "./metas.schema.ts";

type CreateMeta = z.infer<typeof CreateMetaSchema>;
type UpdateMeta = z.infer<typeof UpdateMetaSchema>;
type UpdateEtapa = z.infer<typeof UpdateEtapaSchema>;

export default class MetasService {
  private repository = new MetasRepository();

  // ─── Leitura com apuração ─────────────────────────────────────────────────

  async listar(projetoId: string) {
    await garantirProjeto(projetoId);
    const metas = await this.repository.listarPorProjeto(projetoId);
    const { metas: itens, percentualProjeto } = await this.apurar(projetoId, metas);
    const valorAprovadoTotalCentavos = metas.reduce((soma, m) => soma + m.valorAprovadoCentavos, 0);
    return { itens, percentualProjeto, valorAprovadoTotalCentavos };
  }

  chaves() {
    return LISTA_CHAVES.map((chave) => ({ chave, descricao: CHAVES_APURACAO[chave].descricao }));
  }

  async listarPorId(id: string) {
    const meta = await this.buscarMeta(id);
    return this.detalhar(meta);
  }

  // ─── Metas ────────────────────────────────────────────────────────────────

  async criar({ projetoId, ...data }: CreateMeta) {
    await garantirProjeto(projetoId, { escrita: true });
    await this.garantirNumeroLivre(projetoId, data.numero);
    const meta = await this.repository.inserir({ projetoId, ...data });
    return { meta: await this.detalhar(meta), avisos: await this.avisos(projetoId) };
  }

  async alterar(id: string, data: UpdateMeta) {
    const atual = await this.buscarMeta(id, { escrita: true });
    if (data.numero !== undefined && data.numero !== atual.numero) {
      await this.garantirNumeroLivre(atual.projetoId, data.numero);
    }
    const alterada = await this.repository.alterar(id, data);
    if (!alterada) throw new AppError("Meta não encontrada", 404);
    return { meta: await this.detalhar(alterada), avisos: await this.avisos(atual.projetoId) };
  }

  async excluir(id: string) {
    const meta = await this.buscarMeta(id, { escrita: true });
    if ((await this.repository.contarUsos(id)) > 0) {
      throw new AppError(
        `A meta ${meta.numero} tem produções ou lançamentos financeiros vinculados — desvincule-os antes de excluir`,
        409,
        undefined,
        "META_EM_USO",
      );
    }
    const excluida = await db.transaction((tx) => this.repository.excluir(id, tx));
    if (!excluida) throw new AppError("Meta não encontrada", 404);
  }

  // ─── Indicadores ──────────────────────────────────────────────────────────

  async criarIndicador(metaId: string, data: z.infer<typeof CreateIndicadorSchema>) {
    await this.buscarMeta(metaId, { escrita: true });
    return this.repository.inserirIndicador({ metaId, ...data });
  }

  async alterarIndicador(indicadorId: string, data: z.infer<typeof UpdateIndicadorSchema>) {
    await this.buscarIndicador(indicadorId, { escrita: true });
    const alterado = await this.repository.alterarIndicador(indicadorId, data);
    if (!alterado) throw new AppError("Indicador não encontrado", 404);
    return alterado;
  }

  async excluirIndicador(indicadorId: string) {
    await this.buscarIndicador(indicadorId, { escrita: true });
    const excluido = await db.transaction((tx) => this.repository.excluirIndicador(indicadorId, tx));
    if (!excluido) throw new AppError("Indicador não encontrado", 404);
  }

  // ─── Etapas ───────────────────────────────────────────────────────────────

  async criarEtapa(indicadorId: string, data: z.infer<typeof CreateEtapaSchema>) {
    await this.buscarIndicador(indicadorId, { escrita: true });
    const automatica = data.apuracao === "automatica";
    return this.repository.inserirEtapa({
      indicadorId,
      ...data,
      chave: automatica ? data.chave : null,
      quantidadeManual: automatica ? null : (data.quantidadeManual ?? null),
    });
  }

  async alterarEtapa(etapaId: string, data: UpdateEtapa) {
    const atual = await this.buscarEtapa(etapaId, { escrita: true });
    const alterada = await this.repository.alterarEtapa(etapaId, coerenciaEtapa(atual, data));
    if (!alterada) throw new AppError("Etapa não encontrada", 404);
    return alterada;
  }

  /** Executado de uma etapa MANUAL (a automática vem dos registros — 422). */
  async registrarQuantidade(etapaId: string, quantidadeManual: number | null) {
    const atual = await this.buscarEtapa(etapaId, { escrita: true });
    if (atual.apuracao !== "manual") {
      throw new AppError(
        "Esta etapa é apurada automaticamente pelos registros — não aceita quantidade manual",
        422,
        undefined,
        "ETAPA_AUTOMATICA",
      );
    }
    const alterada = await this.repository.alterarEtapa(etapaId, { quantidadeManual });
    if (!alterada) throw new AppError("Etapa não encontrada", 404);
    return alterada;
  }

  async excluirEtapa(etapaId: string) {
    await this.buscarEtapa(etapaId, { escrita: true });
    const excluida = await this.repository.excluirEtapa(etapaId);
    if (!excluida) throw new AppError("Etapa não encontrada", 404);
  }

  // ─── Apoio ────────────────────────────────────────────────────────────────

  /** Monta indicadores → etapas das metas (2 queries em lote) e calcula a apuração. */
  private async apurar(projetoId: string, metas: MetaRow[]) {
    const indicadores = await this.repository.indicadoresDasMetas(metas.map((m) => m.id));
    const etapas = await this.repository.etapasDosIndicadores(indicadores.map((i) => i.id));

    // Uma consulta por chave USADA (não por etapa)
    const chaves = new Set<ChaveApuracao>();
    for (const e of etapas) if (e.apuracao === "automatica" && ehChaveApuracao(e.chave)) chaves.add(e.chave);
    const valores: ValoresApurados = Object.fromEntries(
      await Promise.all(
        [...chaves].map(async (chave) => [chave, await this.repository.apurar(chave, projetoId)] as const),
      ),
    );

    const arvore = metas.map((m) => ({
      ...m,
      indicadores: indicadores
        .filter((i) => i.metaId === m.id)
        .map((i) => ({ ...i, etapas: etapas.filter((e) => e.indicadorId === i.id) })),
    }));
    return apurarMetas(arvore, valores);
  }

  private async detalhar(meta: MetaRow) {
    const { metas } = await this.apurar(meta.projetoId, [meta]);
    return metas[0];
  }

  private async avisos(projetoId: string): Promise<string[]> {
    const soma = await this.repository.somaPesos(projetoId);
    if (soma <= 100) return [];
    const formatada = soma.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return [`A soma dos pesos das metas do projeto é ${formatada} — o esperado é 100`];
  }

  /** Meta viva e no escopo (404 "Meta não encontrada"); com `escrita`, projeto não encerrado. */
  private async buscarMeta(id: string, { escrita = false } = {}) {
    const meta = await this.repository.porId(id);
    if (!meta || !noEscopo(await escopoAtual(), meta.projetoId)) {
      throw new AppError("Meta não encontrada", 404);
    }
    await garantirProjeto(meta.projetoId, { escrita });
    return meta;
  }

  private async buscarIndicador(id: string, { escrita = false } = {}) {
    const indicador = await this.repository.indicadorPorId(id);
    if (!indicador || !noEscopo(await escopoAtual(), indicador.projetoId)) {
      throw new AppError("Indicador não encontrado", 404);
    }
    await garantirProjeto(indicador.projetoId, { escrita });
    return indicador;
  }

  private async buscarEtapa(id: string, { escrita = false } = {}) {
    const etapa = await this.repository.etapaPorId(id);
    if (!etapa || !noEscopo(await escopoAtual(), etapa.projetoId)) {
      throw new AppError("Etapa não encontrada", 404);
    }
    await garantirProjeto(etapa.projetoId, { escrita });
    return etapa;
  }

  private async garantirNumeroLivre(projetoId: string, numero: number) {
    if (await this.repository.porNumero(projetoId, numero)) {
      throw new AppError(`Já existe a meta ${numero} neste projeto`, 409, undefined, "META_DUPLICADA");
    }
  }
}

/**
 * PATCH de etapa: aplica a mudança sobre o estado atual e garante a coerência
 * apuração × chave × quantidade (o check do banco exige chave ⇔ automática).
 * Trocar para manual limpa a chave; trocar para automática limpa a quantidade.
 */
export function coerenciaEtapa(atual: Pick<EtapaRow, "apuracao" | "chave">, data: UpdateEtapa): UpdateEtapa {
  const apuracao = data.apuracao ?? atual.apuracao;
  if (apuracao === "automatica") {
    if (data.quantidadeManual != null) {
      throw new AppError("Quantidade manual só vale para etapa manual", 400);
    }
    const chave = data.chave !== undefined ? data.chave : atual.chave;
    if (!ehChaveApuracao(chave)) throw new AppError("Etapa automática precisa de uma chave", 400);
    return { ...data, chave, quantidadeManual: null };
  }
  if (data.chave) throw new AppError("Etapa manual não tem chave de apuração", 400);
  return { ...data, chave: null };
}
