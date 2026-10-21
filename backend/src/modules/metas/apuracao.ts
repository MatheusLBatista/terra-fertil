import type { NomeConsulta } from "./metas.repository.ts";

/**
 * ALLOWLIST das chaves de apuração automática das etapas (seção 6 do
 * modelo-dados.html). Cada chave aponta para uma consulta FIXA do
 * `metas.repository.ts` (`CONSULTAS_APURACAO`) que recebe o `projetoId` e conta
 * só registros não excluídos daquele projeto — nunca SQL vindo do banco.
 * Chave gravada numa etapa que não esteja aqui não é executada (vale 0).
 *
 * Este arquivo não toca o banco (o import acima é só de tipo): o cálculo do
 * percentual é uma função pura, coberta por `apuracao.test.ts`.
 */
export const CHAVES_APURACAO = {
  "assoc.visita_inicial": {
    descricao: "Associações com visita inicial realizada",
    consulta: "associacoesComVisitaInicial",
  },
  "assoc.diagnostico_revisado": {
    descricao: "Associações do projeto com diagnóstico revisado",
    consulta: "associacoesComDiagnosticoRevisado",
  },
  "assoc.demanda_identificada": {
    descricao: "Associações com demanda identificada (demanda inicial ou entrega no projeto)",
    consulta: "associacoesComDemanda",
  },
  "producao.relatorio_tecnico_participativo": {
    descricao: "Relatórios técnico-participativos concluídos",
    consulta: "producoesRelatorioTecnicoParticipativo",
  },
  "assoc.parceria": {
    descricao: "Associações com parceria formalizada",
    consulta: "associacoesComParceria",
  },
  "doc.plano_gestao": {
    descricao: "Associações com plano de gestão de equipamentos validado",
    consulta: "associacoesComPlanoGestao",
  },
  "solo.laudos": {
    descricao: "Análises de solo com laudo registrado",
    consulta: "analisesComLaudo",
  },
  "entrega.demandadas": {
    descricao: "Entregas demandadas (não canceladas)",
    consulta: "entregasDemandadas",
  },
  "entrega.compradas": {
    descricao: "Entregas compradas ou entregues",
    consulta: "entregasCompradas",
  },
  "entrega.termo": {
    descricao: "Entregas com termo de uso anexado",
    consulta: "entregasComTermo",
  },
  "entrega.entregues": {
    descricao: "Entregas realizadas",
    consulta: "entregasEntregues",
  },
  "visita.assistencia": {
    descricao: "Visitas de assistência técnica realizadas",
    consulta: "visitasAssistencia",
  },
  "visita.retorno": {
    descricao: "Visitas de acompanhamento realizadas e documentadas (relato ou anexo)",
    consulta: "visitasRetorno",
  },
  "evento.realizados": {
    descricao: "Eventos formativos realizados",
    consulta: "eventosRealizados",
  },
  "evento.capacitados": {
    descricao: "Produtores distintos presentes em eventos realizados",
    consulta: "produtoresCapacitados",
  },
  "equipe.estudantes": {
    descricao: "Estudantes contratados na equipe",
    consulta: "estudantesContratados",
  },
  "producao.relatorio_ou_resumo": {
    descricao: "Relatórios técnicos ou resumos científicos concluídos",
    consulta: "producoesRelatorioOuResumo",
  },
  "producao.relatorio_pesquisa": {
    descricao: "Relatórios de pesquisa concluídos",
    consulta: "producoesRelatorioPesquisa",
  },
  "fin.execucao": {
    descricao: "Execução financeira (% do valor liberado já gasto)",
    consulta: "execucaoFinanceira",
  },
  "equipe.coordenadores": {
    descricao: "Coordenadores contratados na equipe",
    consulta: "coordenadoresContratados",
  },
} as const satisfies Record<string, { descricao: string; consulta: NomeConsulta }>;

export type ChaveApuracao = keyof typeof CHAVES_APURACAO;

/** Lista das chaves (tupla para o `z.enum` do schema). */
export const LISTA_CHAVES = Object.keys(CHAVES_APURACAO) as [ChaveApuracao, ...ChaveApuracao[]];

export const ehChaveApuracao = (chave: string | null | undefined): chave is ChaveApuracao =>
  chave != null && Object.hasOwn(CHAVES_APURACAO, chave);

// ─── Cálculo (puro) ──────────────────────────────────────────────────────────

export type EtapaParaCalculo = {
  quantidadePrevista: number;
  peso: number;
  apuracao: "automatica" | "manual";
  chave: string | null;
  quantidadeManual: number | null;
};

type IndicadorParaCalculo<E> = { etapas: E[] };
type MetaParaCalculo<I> = { peso: number; indicadores: I[] };

/** Valores já apurados por chave (uma consulta por chave usada). */
export type ValoresApurados = Partial<Record<string, number>>;

const arredondar = (n: number) => Math.round(n * 100) / 100;

/** Executado da etapa: consulta da chave se automática; quantidade digitada (ou 0) se manual. */
export function executadoDaEtapa(etapa: EtapaParaCalculo, valores: ValoresApurados): number {
  if (etapa.apuracao === "manual") return etapa.quantidadeManual ?? 0;
  return ehChaveApuracao(etapa.chave) ? (valores[etapa.chave] ?? 0) : 0;
}

/** % da etapa = min(executado ÷ previsto, 1) × peso — sem arredondar. */
function percentualDaEtapa(executado: number, etapa: EtapaParaCalculo): number {
  if (etapa.quantidadePrevista <= 0) return 0;
  return Math.min(Math.max(executado, 0) / etapa.quantidadePrevista, 1) * etapa.peso;
}

/**
 * Apura as metas de um projeto:
 * - etapa: `executado` (o real, mesmo acima do previsto) e `percentual` =
 *   min(executado ÷ previsto, 1) × peso da etapa;
 * - indicador: Σ % das suas etapas (informativo);
 * - meta: Σ % das etapas de todos os indicadores, limitado a 0–100;
 * - projeto: Σ (% da meta × peso da meta ÷ 100).
 * Os cálculos usam os valores cheios; só a saída é arredondada a 2 casas.
 */
type EtapaApurada<E> = E & { executado: number; percentual: number };
type IndicadorApurado<E, I> = Omit<I, "etapas"> & { etapas: EtapaApurada<E>[]; percentual: number };
type MetaApurada<E, I, M> = Omit<M, "indicadores"> & {
  indicadores: IndicadorApurado<E, I>[];
  percentual: number;
};

export function apurarMetas<
  E extends EtapaParaCalculo,
  I extends IndicadorParaCalculo<E>,
  M extends MetaParaCalculo<I>,
>(metas: M[], valores: ValoresApurados): { metas: MetaApurada<E, I, M>[]; percentualProjeto: number } {
  let percentualProjeto = 0;
  const apuradas = metas.map((meta): MetaApurada<E, I, M> => {
    let somaMeta = 0;
    const indicadores = meta.indicadores.map((indicador): IndicadorApurado<E, I> => {
      let somaIndicador = 0;
      const etapas = indicador.etapas.map((etapa): EtapaApurada<E> => {
        const executado = executadoDaEtapa(etapa, valores);
        const percentual = percentualDaEtapa(executado, etapa);
        somaIndicador += percentual;
        return { ...etapa, executado, percentual: arredondar(percentual) };
      });
      somaMeta += somaIndicador;
      return { ...indicador, etapas, percentual: arredondar(somaIndicador) };
    });
    const percentualMeta = Math.min(Math.max(somaMeta, 0), 100);
    percentualProjeto += (percentualMeta * meta.peso) / 100;
    return { ...meta, indicadores, percentual: arredondar(percentualMeta) };
  });
  return { metas: apuradas, percentualProjeto: arredondar(percentualProjeto) };
}
