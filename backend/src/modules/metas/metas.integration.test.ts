import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { associacao } from "../../db/associacao.ts";
import { indicador } from "../../db/indicador.ts";
import { etapaIndicador } from "../../db/etapaIndicador.ts";
import { lancamentoFinanceiro } from "../../db/lancamentoFinanceiro.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Metas pela API: CRUD de metas/indicadores/etapas, allowlist de chaves,
 * etapa manual pelo PUT de quantidade, apuração automática ponta a ponta
 * (`assoc.parceria`) e o ESCOPO por projeto. Os `it` são encadeados.
 */
type Etapa = {
  id: string;
  apuracao: string;
  chave: string | null;
  quantidadeManual: number | null;
  executado?: number;
  percentual?: number;
};
type Indicador = { id: string; percentual?: number; etapas?: Etapa[] };
type Meta = {
  id: string;
  numero: number;
  descricao: string;
  peso: number;
  percentual: number;
  indicadores: (Indicador & { etapas: Etapa[] })[];
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-metas-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";

let admin: string;
let usuario: string;
let tecnico: string;
let adminId: string;
let tecnicoId: string;
let projetoA: string;
let projetoB: string;
let associacaoComParceria: string;
let associacaoSemParceria: string;

let meta1: string;
let meta2: string;
let metaB: string;
let indicadorId: string;
let etapaAuto: string;
let etapaManual: string;

const criarProjeto = async (sigla: string) => {
  const res = await app.request(
    "/projetos",
    comCookie(admin, {
      method: "POST",
      json: { sigla, nome: `Projeto ${sigla}`, inicio: "2026-01-01", fim: "2027-12-31" },
    }),
  );
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).data.id;
};

const novaMeta = (projetoId: string, numero: number, peso: number, valorAprovadoCentavos = 100_000) => ({
  projetoId,
  numero,
  descricao: `Meta ${numero}`,
  valorAprovadoCentavos,
  peso,
});

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  usuario = await login("usuario@example.com");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: SENHA_TECNICO,
      name: "Técnico Metas",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}MA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}MB-${sufixo}`);
  const equipe = await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: tecnicoId, tipo: "tecnico" } }),
  );
  expect(equipe.status).toBe(201);

  [{ id: associacaoComParceria }, { id: associacaoSemParceria }] = await db
    .insert(associacao)
    .values([
      { sigla: `${PREFIXO_TESTE}ASSOC-P-${sufixo}`, municipioId: 1100205 },
      { sigla: `${PREFIXO_TESTE}ASSOC-S-${sufixo}`, municipioId: 1100205 },
    ])
    .returning({ id: associacao.id });
});

describe("gates e validação", () => {
  it("GET /metas sem cookie → 401; POST com usuario@example.com → 403", async () => {
    const anon = await app.request(`/metas?projetoId=${projetoA}`, anonima());
    expect(anon.status).toBe(401);
    expect(await json(anon)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });

    const negado = await app.request(
      "/metas",
      comCookie(usuario, { method: "POST", json: novaMeta(projetoA, 1, 60) }),
    );
    expect(negado.status).toBe(403);
  });

  it("GET /metas sem projetoId → 400 com o campo marcado", async () => {
    const res = await app.request("/metas", comCookie(admin));
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { projetoId: expect.any(String) } });
  });

  it("GET /metas/chaves devolve a allowlist com descrição", async () => {
    const res = await app.request("/metas/chaves", comCookie(admin));
    expect(res.status).toBe(200);
    const corpo = await json<{ chave: string; descricao: string }[]>(res);
    expect(corpo.data).toHaveLength(20);
    expect(corpo.data).toContainEqual({ chave: "assoc.parceria", descricao: expect.any(String) });
  });
});

describe("CRUD de metas", () => {
  it("POST cria a meta (201) com apuração zerada e sem avisos", async () => {
    const res = await app.request(
      "/metas",
      comCookie(admin, { method: "POST", json: novaMeta(projetoA, 1, 60, 1_000_000) }),
    );
    expect(res.status).toBe(201);
    const corpo = await json<Meta>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        numero: 1,
        descricao: "Meta 1",
        valorAprovadoCentavos: 1_000_000,
        peso: 60,
        situacao: "nao_iniciado",
        percentual: 0,
        indicadores: [],
      },
      meta: { avisos: [] },
      erros: [],
    });
    meta1 = corpo.data.id;
  });

  it("POST com o mesmo número no projeto → 409", async () => {
    const res = await app.request(
      "/metas",
      comCookie(admin, { method: "POST", json: novaMeta(projetoA, 1, 10) }),
    );
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "META_DUPLICADA" },
      erros: ["Já existe a meta 1 neste projeto"],
    });
  });

  it("Σ pesos acima de 100 avisa sem bloquear; o mesmo número em outro projeto é permitido", async () => {
    const res = await app.request(
      "/metas",
      comCookie(admin, { method: "POST", json: novaMeta(projetoA, 2, 50, 500_000) }),
    );
    expect(res.status).toBe(201);
    const corpo = await json<Meta>(res);
    expect(corpo.meta.avisos).toEqual([expect.stringContaining("110")]);
    meta2 = corpo.data.id;

    const b = await app.request(
      "/metas",
      comCookie(admin, { method: "POST", json: novaMeta(projetoB, 1, 100) }),
    );
    expect(b.status).toBe(201);
    metaB = (await json<Meta>(b)).data.id;
  });

  it("POST com peso fora de 0–100 → 400", async () => {
    const res = await app.request(
      "/metas",
      comCookie(admin, { method: "POST", json: novaMeta(projetoA, 3, 120) }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { peso: "O peso vai de 0 a 100" } });
  });

  it("PATCH altera e preserva o resto; número de outra meta → 409", async () => {
    const res = await app.request(
      `/metas/${meta1}`,
      comCookie(admin, { method: "PATCH", json: { descricao: "Diagnóstico", situacao: "em_execucao" } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Meta>(res)).data).toMatchObject({
      numero: 1,
      descricao: "Diagnóstico",
      situacao: "em_execucao",
      peso: 60,
    });

    const dup = await app.request(
      `/metas/${meta2}`,
      comCookie(admin, { method: "PATCH", json: { numero: 1 } }),
    );
    expect(dup.status).toBe(409);
  });
});

describe("indicadores e etapas", () => {
  it("POST /metas/:id/indicadores (201)", async () => {
    const res = await app.request(
      `/metas/${meta1}/indicadores`,
      comCookie(admin, { method: "POST", json: { descricao: "Parcerias formalizadas", ordem: 1 } }),
    );
    expect(res.status).toBe(201);
    const corpo = await json<Indicador>(res);
    expect(corpo.data).toEqual({
      id: expect.any(String),
      metaId: meta1,
      descricao: "Parcerias formalizadas",
      ordem: 1,
    });
    indicadorId = corpo.data.id;
  });

  it("etapa automática sem chave, chave fora da allowlist ou manual com chave → 400", async () => {
    const base = { descricao: "Etapa", quantidadePrevista: 2, peso: 50 };
    const semChave = await app.request(
      `/metas/indicadores/${indicadorId}/etapas`,
      comCookie(admin, { method: "POST", json: { ...base, apuracao: "automatica" } }),
    );
    expect(semChave.status).toBe(400);
    expect((await json(semChave)).meta).toEqual({
      campos: { chave: "Etapa automática precisa de uma chave" },
    });

    const foraDaLista = await app.request(
      `/metas/indicadores/${indicadorId}/etapas`,
      comCookie(admin, { method: "POST", json: { ...base, apuracao: "automatica", chave: "x.inexistente" } }),
    );
    expect(foraDaLista.status).toBe(400);
    expect((await json(foraDaLista)).meta).toEqual({
      campos: { chave: "Chave de apuração fora da lista permitida (GET /metas/chaves)" },
    });

    const manualComChave = await app.request(
      `/metas/indicadores/${indicadorId}/etapas`,
      comCookie(admin, { method: "POST", json: { ...base, apuracao: "manual", chave: "assoc.parceria" } }),
    );
    expect(manualComChave.status).toBe(400);
  });

  it("POST cria uma etapa automática e uma manual (201)", async () => {
    const auto = await app.request(
      `/metas/indicadores/${indicadorId}/etapas`,
      comCookie(admin, {
        method: "POST",
        json: {
          descricao: "Parceria formalizada",
          quantidadePrevista: 2,
          peso: 50,
          apuracao: "automatica",
          chave: "assoc.parceria",
          ordem: 1,
        },
      }),
    );
    expect(auto.status).toBe(201);
    const etapa = (await json<Etapa>(auto)).data;
    expect(etapa).toEqual({
      id: expect.any(String),
      indicadorId,
      descricao: "Parceria formalizada",
      quantidadePrevista: 2,
      peso: 50,
      apuracao: "automatica",
      chave: "assoc.parceria",
      quantidadeManual: null,
      ordem: 1,
    });
    etapaAuto = etapa.id;

    const manual = await app.request(
      `/metas/indicadores/${indicadorId}/etapas`,
      comCookie(admin, {
        method: "POST",
        json: { descricao: "Plano assinado", quantidadePrevista: 10, peso: 50, apuracao: "manual", ordem: 2 },
      }),
    );
    expect(manual.status).toBe(201);
    etapaManual = (await json<Etapa>(manual)).data.id;
  });

  it("PUT /metas/etapas/:id/quantidade grava a manual (200) e recusa a automática (422)", async () => {
    const res = await app.request(
      `/metas/etapas/${etapaManual}/quantidade`,
      comCookie(admin, { method: "PUT", json: { quantidadeManual: 5 } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Etapa>(res)).data).toMatchObject({ id: etapaManual, quantidadeManual: 5 });

    const auto = await app.request(
      `/metas/etapas/${etapaAuto}/quantidade`,
      comCookie(admin, { method: "PUT", json: { quantidadeManual: 5 } }),
    );
    expect(auto.status).toBe(422);
    expect((await json(auto)).meta).toEqual({ codigo: "ETAPA_AUTOMATICA" });
  });

  it("PATCH de etapa manual para automática sem chave → 400", async () => {
    const res = await app.request(
      `/metas/etapas/${etapaManual}`,
      comCookie(admin, { method: "PATCH", json: { apuracao: "automatica" } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("apuração automática ponta a ponta (assoc.parceria)", () => {
  it("adesões ao projeto A: uma com parceria formalizada, outra sem", async () => {
    for (const [associacaoId, parceriaFormalizadaEm] of [
      [associacaoComParceria, "2026-02-01"],
      [associacaoSemParceria, null],
    ] as const) {
      const res = await app.request(
        `/projetos/${projetoA}/associacoes`,
        comCookie(admin, { method: "POST", json: { associacaoId, parceriaFormalizadaEm } }),
      );
      expect(res.status).toBe(201);
    }
  });

  it("GET /metas?projetoId= calcula executado e percentuais da etapa, da meta e do projeto", async () => {
    const res = await app.request(`/metas?projetoId=${projetoA}`, comCookie(admin));
    expect(res.status).toBe(200);
    const corpo = await json<Meta[]>(res);
    expect(corpo.data.map((m) => m.numero)).toEqual([1, 2]);

    const [m1, m2] = corpo.data;
    const etapas = m1.indicadores[0].etapas;
    // 1 parceria de 2 previstas × 50 = 25; manual 5 de 10 × 50 = 25
    expect(etapas.map((e) => [e.id, e.executado, e.percentual])).toEqual([
      [etapaAuto, 1, 25],
      [etapaManual, 5, 25],
    ]);
    expect(m1.indicadores[0].percentual).toBe(50);
    expect(m1.percentual).toBe(50);
    expect(m2.percentual).toBe(0);
    // 50% × peso 60 ÷ 100 + 0% × 50 ÷ 100
    expect(corpo.meta).toEqual({ percentualProjeto: 30, valorAprovadoTotalCentavos: 1_500_000 });
  });

  it("GET /metas/:id traz a mesma apuração da meta", async () => {
    const res = await app.request(`/metas/${meta1}`, comCookie(admin));
    expect(res.status).toBe(200);
    expect((await json<Meta>(res)).data).toMatchObject({ id: meta1, percentual: 50 });
  });
});

describe("escopo por projeto", () => {
  it("técnico da equipe de A vê as metas de A", async () => {
    const res = await app.request(`/metas?projetoId=${projetoA}`, comCookie(tecnico));
    expect(res.status).toBe(200);
    expect((await json<Meta[]>(res)).data).toHaveLength(2);
  });

  it("projeto B e meta de B respondem 404 para o técnico", async () => {
    const lista = await app.request(`/metas?projetoId=${projetoB}`, comCookie(tecnico));
    expect(lista.status).toBe(404);
    expect(await json(lista)).toEqual({ data: [], meta: {}, erros: ["Projeto não encontrado"] });

    const meta = await app.request(`/metas/${metaB}`, comCookie(tecnico));
    expect(meta.status).toBe(404);
    expect(await json(meta)).toEqual({ data: [], meta: {}, erros: ["Meta não encontrada"] });
  });
});

describe("exclusão", () => {
  it("meta com lançamento vinculado → 409", async () => {
    await db.insert(lancamentoFinanceiro).values({
      projetoId: projetoA,
      metaId: meta2,
      tipo: "despesa",
      descricao: "Despesa da rubrica",
      valorCentavos: 1_000,
      data: "2026-03-01",
    });
    const res = await app.request(`/metas/${meta2}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "META_EM_USO" });
  });

  it("DELETE leva indicadores e etapas junto (204), depois 404", async () => {
    expect((await app.request(`/metas/${meta1}`, comCookie(admin, { method: "DELETE" }))).status).toBe(204);
    expect((await app.request(`/metas/${meta1}`, comCookie(admin))).status).toBe(404);
    expect((await app.request(`/metas/${meta1}`, comCookie(admin, { method: "DELETE" }))).status).toBe(404);

    const [ind] = await db
      .select({ deletedAt: indicador.deletedAt })
      .from(indicador)
      .where(eq(indicador.id, indicadorId));
    expect(ind.deletedAt).toEqual(expect.any(Date));
    const etapas = await db
      .select({ deletedAt: etapaIndicador.deletedAt })
      .from(etapaIndicador)
      .where(eq(etapaIndicador.indicadorId, indicadorId));
    expect(etapas).toHaveLength(2);
    expect(etapas.every((e) => e.deletedAt instanceof Date)).toBe(true);

    // Etapa de meta excluída também some
    expect(
      (
        await app.request(
          `/metas/etapas/${etapaManual}/quantidade`,
          comCookie(admin, { method: "PUT", json: { quantidadeManual: 1 } }),
        )
      ).status,
    ).toBe(404);
  });

  it("trigger registrou INSERT/UPDATE/DELETE da meta com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "metas"), eq(historicoAlteracao.registroId, meta1)))
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
