import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { meta, type NewMeta } from "../db/meta.ts";
import { indicador } from "../db/indicador.ts";
import { etapaIndicador, type NewEtapaIndicador } from "../db/etapaIndicador.ts";
import { lancamentoFinanceiro } from "../db/lancamentoFinanceiro.ts";
import { idDoProjeto } from "./projetos.ts";

type Etapa = Pick<NewEtapaIndicador, "descricao" | "quantidadePrevista" | "peso"> &
  ({ chave: string; manual?: never } | { chave?: never; manual: number | null });

type MetaSeed = Omit<NewMeta, "projetoId"> & { indicadores: { descricao: string; etapas: Etapa[] }[] };

/**
 * Metas do Projeto Terra Fértil — aba Resumo + abas M1…M10 de
 * docs/Acompanhamento de Metas.xlsx (previsto e peso por etapa). Etapas com
 * `chave` são calculadas pelos registros do sistema (allowlist em
 * src/modules/metas/apuracao.ts); `manual` traz o executado da planilha.
 * M2 "planos de gestão": a planilha diz 50 no texto e 500 no previsto — usamos 50.
 */
const METAS_TERRA_FERTIL: MetaSeed[] = [
  {
    numero: 1,
    descricao:
      "Realizar diagnóstico técnico e produtivo das comunidades atendidas, com ênfase na caracterização dos arranjos produtivos locais.",
    valorAprovadoCentavos: 25_100_000,
    peso: 30,
    situacao: "em_execucao",
    indicadores: [
      {
        descricao: "Diagnóstico de pelo menos 100 associações.",
        etapas: [
          {
            descricao: "Levantamento de campo realizado",
            quantidadePrevista: 100,
            peso: 50,
            chave: "assoc.visita_inicial",
          },
          {
            descricao: "Informações sistematizadas",
            quantidadePrevista: 100,
            peso: 15,
            chave: "assoc.diagnostico_revisado",
          },
          {
            descricao: "Demandas prioritárias identificadas",
            quantidadePrevista: 100,
            peso: 15,
            chave: "assoc.demanda_identificada",
          },
        ],
      },
      {
        descricao: "3 relatórios técnico-participativos elaborados.",
        etapas: [
          {
            descricao: "Relatório elaborado",
            quantidadePrevista: 3,
            peso: 20,
            chave: "producao.relatorio_tecnico_participativo",
          },
        ],
      },
    ],
  },
  {
    numero: 2,
    descricao:
      "Fortalecer as associações rurais como instâncias organizadoras da produção, da assistência técnica e da gestão de equipamentos.",
    valorAprovadoCentavos: 59_500_000,
    peso: 5,
    situacao: "nao_iniciado",
    indicadores: [
      {
        descricao: "50 associações parceiras formalizadas.",
        etapas: [
          {
            descricao: "Parceria operacional formalizada",
            quantidadePrevista: 50,
            peso: 50,
            chave: "assoc.parceria",
          },
        ],
      },
      {
        descricao: "50 planos de gestão de equipamentos elaborados.",
        etapas: [
          {
            descricao: "Plano de gestão elaborado",
            quantidadePrevista: 50,
            peso: 50,
            chave: "doc.plano_gestao",
          },
        ],
      },
    ],
  },
  {
    numero: 3,
    descricao:
      "Identificar os principais fatores edáficos que limitam a produtividade e recomendar práticas de manejo e conservação do solo.",
    valorAprovadoCentavos: 321_200_000,
    peso: 25,
    situacao: "em_execucao",
    indicadores: [
      {
        descricao: "5.000 análises laboratoriais realizadas.",
        etapas: [
          { descricao: "Coleta realizada", quantidadePrevista: 5000, peso: 50, manual: 1018 },
          { descricao: "Análise realizada", quantidadePrevista: 5000, peso: 25, manual: 565 },
        ],
      },
      {
        descricao: "1.000 laudos com recomendações entregues.",
        etapas: [
          { descricao: "Laudo com recomendações", quantidadePrevista: 1000, peso: 25, chave: "solo.laudos" },
        ],
      },
    ],
  },
  {
    numero: 4,
    descricao:
      "Adquirir e entregar máquinas, insumos e implementos agrícolas básicos, com base nas demandas priorizadas pelos diagnósticos locais.",
    valorAprovadoCentavos: 4_500_000_000,
    peso: 10,
    situacao: "em_execucao",
    indicadores: [
      {
        descricao: "100 kits/equipamentos entregues.",
        etapas: [
          {
            descricao: "Levantamento de demanda realizado",
            quantidadePrevista: 100,
            peso: 20,
            chave: "entrega.demandadas",
          },
          { descricao: "Compra realizada", quantidadePrevista: 100, peso: 50, chave: "entrega.compradas" },
          { descricao: "Termo de uso elaborado", quantidadePrevista: 100, peso: 15, chave: "entrega.termo" },
          { descricao: "Entrega realizada", quantidadePrevista: 100, peso: 15, chave: "entrega.entregues" },
        ],
      },
    ],
  },
  {
    numero: 5,
    descricao: "Prestar assessoria técnica a produtores rurais associados durante a execução do projeto.",
    valorAprovadoCentavos: 35_000_000,
    peso: 10,
    situacao: "nao_iniciado",
    indicadores: [
      {
        descricao: "500 atendimentos registrados.",
        etapas: [
          {
            descricao: "Atendimento realizado",
            quantidadePrevista: 500,
            peso: 50,
            chave: "visita.assistencia",
          },
        ],
      },
      {
        descricao: "200 visitas de retorno documentadas.",
        etapas: [
          { descricao: "Visita documentada", quantidadePrevista: 200, peso: 50, chave: "visita.retorno" },
        ],
      },
    ],
  },
  {
    numero: 6,
    descricao:
      "Capacitar agricultores em tecnologias apropriadas e práticas sustentáveis de uso do solo e produção agropecuária.",
    valorAprovadoCentavos: 47_100_000,
    peso: 10,
    situacao: "nao_iniciado",
    indicadores: [
      {
        descricao: "50 eventos formativos realizados.",
        etapas: [
          { descricao: "Evento realizado", quantidadePrevista: 50, peso: 50, chave: "evento.realizados" },
        ],
      },
      {
        descricao: "500 agricultores capacitados.",
        etapas: [
          {
            descricao: "Capacitação realizada",
            quantidadePrevista: 500,
            peso: 50,
            chave: "evento.capacitados",
          },
        ],
      },
    ],
  },
  {
    numero: 7,
    descricao:
      "Envolver estudantes dos cursos superiores das ciências agrárias em atividades práticas de extensão no projeto.",
    valorAprovadoCentavos: 29_560_000,
    peso: 3,
    situacao: "nao_iniciado",
    indicadores: [
      {
        descricao: "10 estudantes envolvidos.",
        etapas: [
          {
            descricao: "Contratação realizada",
            quantidadePrevista: 10,
            peso: 50,
            chave: "equipe.estudantes",
          },
        ],
      },
      {
        descricao: "10 relatórios técnicos ou resumos científicos produzidos.",
        etapas: [
          {
            descricao: "Relatório produzido",
            quantidadePrevista: 10,
            peso: 50,
            chave: "producao.relatorio_ou_resumo",
          },
        ],
      },
    ],
  },
  {
    numero: 8,
    descricao: "Desenvolver e fomentar tecnologias aplicadas aos arranjos produtivos locais atendidos.",
    valorAprovadoCentavos: 60_940_000,
    peso: 5,
    situacao: "em_execucao",
    indicadores: [
      {
        descricao: "2 ferramentas de TICs desenvolvidas.",
        etapas: [
          { descricao: "Proposta apresentada", quantidadePrevista: 2, peso: 10, manual: 1 },
          { descricao: "Modelagem de dados", quantidadePrevista: 2, peso: 10, manual: 0 },
          { descricao: "API", quantidadePrevista: 2, peso: 10, manual: 0 },
          { descricao: "Frontend web", quantidadePrevista: 2, peso: 20, manual: 0 },
          { descricao: "App mobile", quantidadePrevista: 2, peso: 30, manual: 0 },
          { descricao: "Ferramenta implantada", quantidadePrevista: 2, peso: 5, manual: 0 },
          { descricao: "Capacitação realizada", quantidadePrevista: 2, peso: 5, manual: 0 },
        ],
      },
      {
        descricao: "6 relatórios de projetos de pesquisa entregues.",
        etapas: [
          {
            descricao: "Relatório produzido",
            quantidadePrevista: 6,
            peso: 10,
            chave: "producao.relatorio_pesquisa",
          },
        ],
      },
    ],
  },
  {
    numero: 9,
    descricao: "Administrar e gerir eficientemente o recurso.",
    valorAprovadoCentavos: 324_500_000,
    peso: 1,
    situacao: "em_execucao",
    indicadores: [
      {
        descricao: "Executar todo o recurso disponível.",
        // Executado = % do liberado que já foi gasto
        etapas: [
          { descricao: "Recurso executado (%)", quantidadePrevista: 100, peso: 100, chave: "fin.execucao" },
        ],
      },
    ],
  },
  {
    numero: 10,
    descricao: "Nomear, contratar e capacitar equipe de coordenadores para condução do projeto.",
    valorAprovadoCentavos: 97_100_000,
    peso: 1,
    situacao: "em_execucao",
    indicadores: [
      {
        descricao: "Contratar até 6 coordenadores.",
        etapas: [
          {
            descricao: "Contratação realizada",
            quantidadePrevista: 6,
            peso: 100,
            chave: "equipe.coordenadores",
          },
        ],
      },
    ],
  },
];

/** Totais da aba M9 — entram como dois lançamentos agregados, datados da importação. */
const FINANCEIRO_TERRA_FERTIL = { liberadoCentavos: 2_901_931_853, utilizadoCentavos: 1_231_844_921 };

export async function seedMetas() {
  console.log("Seeding metas...");
  const projetoId = await idDoProjeto("TERRA-FERTIL");
  if (!projetoId) {
    console.log("  - projeto TERRA-FERTIL não existe, pulando.");
    return;
  }
  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(meta)
    .where(and(eq(meta.projetoId, projetoId), isNull(meta.deletedAt)));
  if (total > 0) {
    console.log(`  - TERRA-FERTIL já tem ${total} meta(s), pulando.`);
    return;
  }

  await db.transaction(async (tx) => {
    for (const { indicadores, ...m } of METAS_TERRA_FERTIL) {
      const [{ id: metaId }] = await tx
        .insert(meta)
        .values({ ...m, projetoId })
        .returning({ id: meta.id });
      for (const [i, ind] of indicadores.entries()) {
        const [{ id: indicadorId }] = await tx
          .insert(indicador)
          .values({ metaId, descricao: ind.descricao, ordem: i + 1 })
          .returning({ id: indicador.id });
        await tx.insert(etapaIndicador).values(
          ind.etapas.map((e, j) => ({
            indicadorId,
            descricao: e.descricao,
            quantidadePrevista: e.quantidadePrevista,
            peso: e.peso,
            apuracao: e.chave ? ("automatica" as const) : ("manual" as const),
            chave: e.chave ?? null,
            quantidadeManual: e.chave ? null : e.manual,
            ordem: j + 1,
          })),
        );
      }
    }
    const hoje = new Date().toISOString().slice(0, 10);
    await tx.insert(lancamentoFinanceiro).values([
      {
        projetoId,
        tipo: "liberacao",
        descricao: "Total liberado até a importação (planilha de metas, M9)",
        valorCentavos: FINANCEIRO_TERRA_FERTIL.liberadoCentavos,
        data: hoje,
      },
      {
        projetoId,
        tipo: "despesa",
        descricao: "Total utilizado até a importação (planilha de metas, M9)",
        valorCentavos: FINANCEIRO_TERRA_FERTIL.utilizadoCentavos,
        data: hoje,
      },
    ]);
  });
  console.log(
    `✓ ${METAS_TERRA_FERTIL.length} metas do TERRA-FERTIL inseridas (com indicadores, etapas e saldo M9).`,
  );
}

if (process.argv[1]?.endsWith("metas.ts")) {
  seedMetas()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
