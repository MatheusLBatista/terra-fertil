import { describe, expect, it } from "vitest";
import { CHAVES_APURACAO, LISTA_CHAVES, apurarMetas, ehChaveApuracao, executadoDaEtapa } from "./apuracao.ts";

type Etapa = {
  quantidadePrevista: number;
  peso: number;
  apuracao: "automatica" | "manual";
  chave: string | null;
  quantidadeManual: number | null;
};

const auto = (chave: string, quantidadePrevista: number, peso: number): Etapa => ({
  quantidadePrevista,
  peso,
  apuracao: "automatica",
  chave,
  quantidadeManual: null,
});
const manual = (quantidadeManual: number | null, quantidadePrevista: number, peso: number): Etapa => ({
  quantidadePrevista,
  peso,
  apuracao: "manual",
  chave: null,
  quantidadeManual,
});

describe("allowlist", () => {
  it("tem exatamente as chaves usadas no seed de metas", () => {
    expect([...LISTA_CHAVES].sort()).toEqual(
      [
        "assoc.visita_inicial",
        "assoc.diagnostico_revisado",
        "assoc.demanda_identificada",
        "producao.relatorio_tecnico_participativo",
        "assoc.parceria",
        "doc.plano_gestao",
        "solo.laudos",
        "entrega.demandadas",
        "entrega.compradas",
        "entrega.termo",
        "entrega.entregues",
        "visita.assistencia",
        "visita.retorno",
        "evento.realizados",
        "evento.capacitados",
        "equipe.estudantes",
        "producao.relatorio_ou_resumo",
        "producao.relatorio_pesquisa",
        "fin.execucao",
        "equipe.coordenadores",
      ].sort(),
    );
    for (const chave of LISTA_CHAVES) expect(CHAVES_APURACAO[chave].descricao).not.toBe("");
  });

  it("ehChaveApuracao recusa chave desconhecida, nula e propriedade herdada", () => {
    expect(ehChaveApuracao("fin.execucao")).toBe(true);
    expect(ehChaveApuracao("drop table metas")).toBe(false);
    expect(ehChaveApuracao(null)).toBe(false);
    expect(ehChaveApuracao("toString")).toBe(false);
  });
});

describe("executadoDaEtapa", () => {
  it("automática lê o valor da chave; sem valor apurado vale 0", () => {
    expect(executadoDaEtapa(auto("assoc.parceria", 50, 50), { "assoc.parceria": 7 })).toBe(7);
    expect(executadoDaEtapa(auto("assoc.parceria", 50, 50), {})).toBe(0);
  });

  it("automática com chave fora da allowlist vale 0 (nunca executa nada)", () => {
    expect(executadoDaEtapa(auto("x.inexistente", 10, 10), { "x.inexistente": 99 })).toBe(0);
  });

  it("manual usa a quantidade digitada (null = 0) e ignora os valores apurados", () => {
    expect(executadoDaEtapa(manual(12, 100, 50), { "assoc.parceria": 99 })).toBe(12);
    expect(executadoDaEtapa(manual(null, 100, 50), {})).toBe(0);
  });
});

describe("apurarMetas", () => {
  it("% da etapa = executado ÷ previsto × peso; meta soma as etapas; projeto pondera pelo peso da meta", () => {
    const { metas, percentualProjeto } = apurarMetas(
      [
        {
          peso: 30,
          indicadores: [
            {
              etapas: [
                auto("assoc.visita_inicial", 100, 50), // 40/100 × 50 = 20
                auto("assoc.diagnostico_revisado", 100, 15), // 10/100 × 15 = 1,5
                manual(50, 100, 15), // 7,5
              ],
            },
            { etapas: [auto("producao.relatorio_tecnico_participativo", 3, 20)] }, // 1/3 × 20 = 6,666…
          ],
        },
        { peso: 10, indicadores: [{ etapas: [auto("fin.execucao", 100, 100)] }] }, // 42
      ],
      {
        "assoc.visita_inicial": 40,
        "assoc.diagnostico_revisado": 10,
        "producao.relatorio_tecnico_participativo": 1,
        "fin.execucao": 42,
      },
    );

    const [m1, m9] = metas;
    expect(m1.indicadores[0].etapas.map((e) => [e.executado, e.percentual])).toEqual([
      [40, 20],
      [10, 1.5],
      [50, 7.5],
    ]);
    expect(m1.indicadores[0].percentual).toBe(29);
    expect(m1.indicadores[1].etapas[0]).toMatchObject({ executado: 1, percentual: 6.67 });
    expect(m1.indicadores[1].percentual).toBe(6.67);
    expect(m1.percentual).toBe(35.67);
    expect(m9.percentual).toBe(42);
    // 35,666…% × 30 ÷ 100 + 42% × 10 ÷ 100 = 10,7 + 4,2 (sem arredondar no meio)
    expect(percentualProjeto).toBe(14.9);
  });

  it("executado acima do previsto aparece cheio, mas a etapa não passa do próprio peso", () => {
    const { metas } = apurarMetas([{ peso: 100, indicadores: [{ etapas: [auto("solo.laudos", 10, 25)] }] }], {
      "solo.laudos": 37,
    });
    expect(metas[0].indicadores[0].etapas[0]).toMatchObject({ executado: 37, percentual: 25 });
    expect(metas[0].percentual).toBe(25);
  });

  it("% da meta fica limitado a 100 mesmo com pesos de etapa somando mais", () => {
    const { metas, percentualProjeto } = apurarMetas(
      [{ peso: 50, indicadores: [{ etapas: [manual(10, 10, 80), manual(10, 10, 80)] }] }],
      {},
    );
    expect(metas[0].percentual).toBe(100);
    expect(percentualProjeto).toBe(50);
  });

  it("preserva os campos extras (id, descricao…) e aceita meta sem indicadores", () => {
    const { metas, percentualProjeto } = apurarMetas(
      [
        { id: "m1", peso: 20, indicadores: [] },
        {
          id: "m2",
          peso: 80,
          indicadores: [{ id: "i1", etapas: [{ id: "e1", ...manual(1, 4, 100) }] }],
        },
      ],
      {},
    );
    expect(metas[0]).toEqual({ id: "m1", peso: 20, indicadores: [], percentual: 0 });
    expect(metas[1].indicadores[0].etapas[0]).toMatchObject({ id: "e1", executado: 1, percentual: 25 });
    expect(percentualProjeto).toBe(20);
  });

  it("projeto sem metas = 0%", () => {
    expect(apurarMetas([], {})).toEqual({ metas: [], percentualProjeto: 0 });
  });
});
