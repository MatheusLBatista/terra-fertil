import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { lancamentoFinanceiro } from "../../db/lancamentoFinanceiro.ts";
import { user } from "../../db/user.ts";
import { auth } from "../../lib/auth.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Lançamentos financeiros pela API: CRUD, filtros + totais do filtro, meta do
 * mesmo projeto (422), a apuração `fin.execucao` da Meta 9 ponta a ponta,
 * escopo por projeto e projeto encerrado. Os `it` são encadeados.
 */
type Lancamento = {
  id: string;
  projetoId: string;
  metaId: string | null;
  metaNumero: number | null;
  tipo: string;
  descricao: string;
  valorCentavos: number;
  data: string;
  documentoRef: string | null;
};
type Etapa = { id: string; executado: number; percentual: number };
type Meta = { id: string; percentual: number; indicadores: { etapas: Etapa[] }[] };

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-fin-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";

let admin: string;
let usuario: string;
let tecnico: string;
let adminId: string;
let tecnicoId: string;
let projetoA: string;
let projetoB: string;
let metaA: string;
let metaB: string;
let liberacaoA: string;
let despesaA: string;
let lancamentoB: string;

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

const criarMeta = async (projetoId: string, numero: number) => {
  const res = await app.request(
    "/metas",
    comCookie(admin, {
      method: "POST",
      json: { projetoId, numero, descricao: "Gerir o recurso", valorAprovadoCentavos: 0, peso: 100 },
    }),
  );
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).data.id;
};

const lancar = (cookie: string, corpo: Record<string, unknown>) =>
  app.request("/lancamentos", comCookie(cookie, { method: "POST", json: corpo }));

beforeAll(async () => {
  admin = await login("fslab.vilhena@ifro.edu.br");
  usuario = await login("usuario@example.com");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  const criado = await auth.api.createUser({
    body: { email: EMAIL_TECNICO, password: SENHA_TECNICO, name: "Técnico Fin", role: "tecnico" as "admin" },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}FA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}FB-${sufixo}`);
  const equipe = await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: tecnicoId, tipo: "tecnico" } }),
  );
  expect(equipe.status).toBe(201);

  // Meta 9 do projeto A com a etapa automática fin.execucao (previsto 100%)
  metaA = await criarMeta(projetoA, 9);
  const ind = await app.request(
    `/metas/${metaA}/indicadores`,
    comCookie(admin, { method: "POST", json: { descricao: "Executar todo o recurso" } }),
  );
  const indicadorId = (await json<{ id: string }>(ind)).data.id;
  const etapa = await app.request(
    `/metas/indicadores/${indicadorId}/etapas`,
    comCookie(admin, {
      method: "POST",
      json: {
        descricao: "Recurso executado (%)",
        quantidadePrevista: 100,
        peso: 100,
        apuracao: "automatica",
        chave: "fin.execucao",
      },
    }),
  );
  expect(etapa.status).toBe(201);
  metaB = await criarMeta(projetoB, 1);
});

const execucaoDoProjetoA = async () => {
  const res = await app.request(`/metas?projetoId=${projetoA}`, comCookie(admin));
  expect(res.status).toBe(200);
  const [meta] = (await json<Meta[]>(res)).data;
  return meta.indicadores[0].etapas[0];
};

describe("gates", () => {
  it("GET sem cookie → 401; POST com usuario@example.com → 403", async () => {
    const anon = await app.request("/lancamentos", anonima());
    expect(anon.status).toBe(401);
    expect(await json(anon)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });

    const negado = await lancar(usuario, {
      projetoId: projetoA,
      tipo: "liberacao",
      descricao: "x",
      valorCentavos: 1,
      data: "2026-01-10",
    });
    expect(negado.status).toBe(403);
  });
});

describe("CRUD", () => {
  it("POST registra liberação e despesa (201); a despesa mostra o número da meta", async () => {
    const lib = await lancar(admin, {
      projetoId: projetoA,
      tipo: "liberacao",
      descricao: "1ª parcela",
      valorCentavos: 100_000,
      data: "2026-01-10",
    });
    expect(lib.status).toBe(201);
    const corpo = await json<Lancamento>(lib);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        metaId: null,
        metaNumero: null,
        tipo: "liberacao",
        descricao: "1ª parcela",
        valorCentavos: 100_000,
        data: "2026-01-10",
        documentoRef: null,
        createdAt: expect.any(String),
      },
      meta: {},
      erros: [],
    });
    liberacaoA = corpo.data.id;

    const desp = await lancar(admin, {
      projetoId: projetoA,
      metaId: metaA,
      tipo: "despesa",
      descricao: "Combustível",
      valorCentavos: 25_000,
      data: "2026-02-15",
      documentoRef: "NF 123",
    });
    expect(desp.status).toBe(201);
    const despesa = (await json<Lancamento>(desp)).data;
    expect(despesa).toMatchObject({ metaId: metaA, metaNumero: 9, documentoRef: "NF 123" });
    despesaA = despesa.id;

    const b = await lancar(admin, {
      projetoId: projetoB,
      tipo: "liberacao",
      descricao: "Parcela B",
      valorCentavos: 50_000,
      data: "2026-01-20",
    });
    expect(b.status).toBe(201);
    lancamentoB = (await json<Lancamento>(b)).data.id;
  });

  it("meta de outro projeto → 422", async () => {
    const res = await lancar(admin, {
      projetoId: projetoA,
      metaId: metaB,
      tipo: "despesa",
      descricao: "Errada",
      valorCentavos: 1_000,
      data: "2026-02-20",
    });
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "META_DE_OUTRO_PROJETO" },
      erros: ["A meta informada não é deste projeto"],
    });
  });

  it("valor zero ou tipo inválido → 400", async () => {
    const zero = await lancar(admin, {
      projetoId: projetoA,
      tipo: "despesa",
      descricao: "Zero",
      valorCentavos: 0,
      data: "2026-02-20",
    });
    expect(zero.status).toBe(400);
    expect((await json(zero)).meta).toEqual({ campos: { valorCentavos: "O valor deve ser maior que zero" } });

    const tipo = await lancar(admin, {
      projetoId: projetoA,
      tipo: "estorno",
      descricao: "X",
      valorCentavos: 10,
      data: "2026-02-20",
    });
    expect(tipo.status).toBe(400);
  });

  it("PATCH altera e preserva o resto", async () => {
    const res = await app.request(
      `/lancamentos/${despesaA}`,
      comCookie(admin, { method: "PATCH", json: { valorCentavos: 50_000 } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Lancamento>(res)).data).toMatchObject({
      valorCentavos: 50_000,
      descricao: "Combustível",
      metaId: metaA,
      data: "2026-02-15",
    });
  });
});

describe("listagem, filtros e totais", () => {
  it("padrão: data desc, com os totais do filtro no meta", async () => {
    const res = await app.request(`/lancamentos?projetoId=${projetoA}`, comCookie(admin));
    expect(res.status).toBe(200);
    const corpo = await json<Lancamento[]>(res);
    expect(corpo.data.map((l) => l.id)).toEqual([despesaA, liberacaoA]);
    expect(corpo.meta).toEqual({
      total: 2,
      limit: 10,
      offset: 0,
      totais: { liberadoCentavos: 100_000, despesaCentavos: 50_000 },
    });
  });

  it("filtros tipo, período e busca; os totais acompanham o filtro", async () => {
    const tipo = await json<Lancamento[]>(
      await app.request(`/lancamentos?projetoId=${projetoA}&tipo=despesa`, comCookie(admin)),
    );
    expect(tipo.data.map((l) => l.id)).toEqual([despesaA]);
    expect(tipo.meta.totais).toEqual({ liberadoCentavos: 0, despesaCentavos: 50_000 });

    const periodo = await json<Lancamento[]>(
      await app.request(`/lancamentos?projetoId=${projetoA}&de=2026-01-01&ate=2026-01-31`, comCookie(admin)),
    );
    expect(periodo.data.map((l) => l.id)).toEqual([liberacaoA]);

    const busca = await json<Lancamento[]>(
      await app.request(`/lancamentos?busca=nf%20123`, comCookie(admin)),
    );
    expect(busca.data.map((l) => l.id)).toEqual([despesaA]);

    const meta = await json<Lancamento[]>(
      await app.request(`/lancamentos?metaId=${metaA}`, comCookie(admin)),
    );
    expect(meta.data.map((l) => l.id)).toEqual([despesaA]);
  });

  it("sort por valor asc; campo fora da allowlist → 400", async () => {
    const res = await json<Lancamento[]>(
      await app.request(`/lancamentos?projetoId=${projetoA}&sort=valorCentavos:asc`, comCookie(admin)),
    );
    expect(res.data.map((l) => l.id)).toEqual([despesaA, liberacaoA]);

    const invalido = await app.request("/lancamentos?sort=descricao:asc", comCookie(admin));
    expect(invalido.status).toBe(400);
  });
});

describe("apuração da Meta 9 (fin.execucao)", () => {
  it("executado = round(100 × Σ despesa ÷ Σ liberação) do projeto", async () => {
    // 50.000 ÷ 100.000 — o lançamento do projeto B não entra
    expect(await execucaoDoProjetoA()).toMatchObject({ executado: 50, percentual: 50 });
  });
});

describe("escopo por projeto", () => {
  it("técnico vê só os lançamentos do projeto A", async () => {
    const res = await app.request("/lancamentos", comCookie(tecnico));
    expect(res.status).toBe(200);
    const corpo = await json<Lancamento[]>(res);
    expect(corpo.data.map((l) => l.id).sort()).toEqual([despesaA, liberacaoA].sort());
    expect(corpo.meta.totais).toEqual({ liberadoCentavos: 100_000, despesaCentavos: 50_000 });
  });

  it("filtro e lançamento do projeto B → 404 para o técnico", async () => {
    expect((await app.request(`/lancamentos?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
    const res = await app.request(`/lancamentos/${lancamentoB}`, comCookie(tecnico));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Lançamento não encontrado"] });
  });
});

describe("exclusão e projeto encerrado", () => {
  it("DELETE (204) → GET 404 → DELETE 404; a execução volta a 0%", async () => {
    expect(
      (await app.request(`/lancamentos/${despesaA}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(204);
    expect((await app.request(`/lancamentos/${despesaA}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/lancamentos/${despesaA}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(404);
    const [linha] = await db
      .select({ deletedAt: lancamentoFinanceiro.deletedAt })
      .from(lancamentoFinanceiro)
      .where(eq(lancamentoFinanceiro.id, despesaA));
    expect(linha.deletedAt).toEqual(expect.any(Date));
    expect(await execucaoDoProjetoA()).toMatchObject({ executado: 0, percentual: 0 });
  });

  it("projeto encerrado é somente leitura (409)", async () => {
    await app.request(
      `/projetos/${projetoB}`,
      comCookie(admin, { method: "PATCH", json: { situacao: "encerrado" } }),
    );
    const novo = await lancar(admin, {
      projetoId: projetoB,
      tipo: "despesa",
      descricao: "Depois do fim",
      valorCentavos: 10,
      data: "2026-03-01",
    });
    expect(novo.status).toBe(409);
    expect((await json(novo)).meta).toEqual({ codigo: "PROJETO_ENCERRADO" });

    const alterar = await app.request(
      `/lancamentos/${lancamentoB}`,
      comCookie(admin, { method: "PATCH", json: { descricao: "Nova" } }),
    );
    expect(alterar.status).toBe(409);
    // Leitura continua liberada
    expect((await app.request(`/lancamentos/${lancamentoB}`, comCookie(admin))).status).toBe(200);
  });

  it("trigger registrou INSERT/UPDATE/DELETE com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(
          eq(historicoAlteracao.tabela, "lancamentos_financeiros"),
          eq(historicoAlteracao.registroId, despesaA),
        ),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
