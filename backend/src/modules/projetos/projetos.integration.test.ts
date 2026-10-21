import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Projetos pela API: CRUD, equipe, adesões e — o ponto central — o ESCOPO:
 * um técnico só enxerga os projetos em que está na equipe; o resto é 404.
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Projeto = { id: string; sigla: string; nome: string; situacao: string; inicio: string; fim: string };
type Membro = { id: string; userId: string; nome: string; email: string | null; tipo: string };
type Adesao = { id: string; associacaoId: string; sigla: string; demandaInicial: string | null };

const sufixo = randomUUID().slice(0, 8);
const SIGLA_A = `${PREFIXO_TESTE}A-${sufixo}`;
const SIGLA_B = `${PREFIXO_TESTE}B-${sufixo}`;
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";

let admin: string;
let tecnico: string;
let tecnicoId: string;
let adminId: string;
let projetoA: string;
let projetoB: string;
let associacaoId: string;

const novoProjeto = (sigla: string) => ({
  sigla,
  nome: `Projeto ${sigla}`,
  inicio: "2026-01-01",
  fim: "2027-12-31",
  valorTotalCentavos: 100_000,
});

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: SENHA_TECNICO,
      name: "Técnico de Teste",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  [{ id: associacaoId }] = await db
    .insert(associacao)
    .values({ sigla: `${PREFIXO_TESTE}ASSOC`, municipioId: 1100205 })
    .returning({ id: associacao.id });
});

describe("gates", () => {
  it("GET /projetos sem cookie → 401", async () => {
    const res = await app.request("/projetos", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /projetos com técnico (só lê projetos) → 403", async () => {
    const res = await app.request(
      "/projetos",
      comCookie(tecnico, { method: "POST", json: novoProjeto(SIGLA_A) }),
    );
    expect(res.status).toBe(403);
  });
});

describe("CRUD de projetos", () => {
  it("POST cria dois projetos (201)", async () => {
    const a = await app.request(
      "/projetos",
      comCookie(admin, { method: "POST", json: novoProjeto(SIGLA_A) }),
    );
    expect(a.status).toBe(201);
    const corpo = await json<Projeto>(a);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        sigla: SIGLA_A,
        nome: `Projeto ${SIGLA_A}`,
        numeroInstrumento: null,
        concedente: null,
        executor: null,
        inicio: "2026-01-01",
        fim: "2027-12-31",
        valorTotalCentavos: 100_000,
        situacao: "planejado",
      },
      meta: {},
      erros: [],
    });
    projetoA = corpo.data.id;

    const b = await app.request(
      "/projetos",
      comCookie(admin, { method: "POST", json: novoProjeto(SIGLA_B) }),
    );
    projetoB = (await json<Projeto>(b)).data.id;
  });

  it("POST com a mesma sigla (outra caixa) → 409", async () => {
    const res = await app.request(
      "/projetos",
      comCookie(admin, { method: "POST", json: novoProjeto(SIGLA_A.toLowerCase()) }),
    );
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "PROJETO_DUPLICADO" },
      erros: [`Já existe um projeto "${SIGLA_A.toLowerCase()}"`],
    });
  });

  it("POST com fim antes do início → 400 com o campo marcado", async () => {
    const res = await app.request(
      "/projetos",
      comCookie(admin, { method: "POST", json: { ...novoProjeto(`${SIGLA_A}-x`), fim: "2025-01-01" } }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { fim: "O fim não pode ser antes do início" } });
  });

  it("PATCH altera e preserva o resto; sort fora da allowlist → 400", async () => {
    const res = await app.request(
      `/projetos/${projetoA}`,
      comCookie(admin, { method: "PATCH", json: { situacao: "em_execucao" } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Projeto>(res)).data).toMatchObject({ situacao: "em_execucao", sigla: SIGLA_A });

    const sort = await app.request("/projetos?sort=valor:asc", comCookie(admin));
    expect(sort.status).toBe(400);
  });
});

describe("escopo por projeto", () => {
  it("técnico fora de qualquer equipe não vê projeto nenhum", async () => {
    const res = await app.request("/projetos", comCookie(tecnico));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: [], meta: { total: 0, limit: 10, offset: 0 }, erros: [] });
  });

  it("POST /projetos/:id/equipe inclui o técnico no projeto A (201)", async () => {
    const res = await app.request(
      `/projetos/${projetoA}/equipe`,
      comCookie(admin, {
        method: "POST",
        json: { userId: tecnicoId, tipo: "tecnico", funcao: "Técnico de campo" },
      }),
    );
    expect(res.status).toBe(201);
    expect((await json<Membro>(res)).data).toMatchObject({
      userId: tecnicoId,
      nome: "Técnico de Teste",
      email: EMAIL_TECNICO,
      tipo: "tecnico",
    });
  });

  it("o técnico passa a ver só o projeto A; o B responde 404", async () => {
    const lista = await json<Projeto[]>(await app.request("/projetos", comCookie(tecnico)));
    expect(lista.data.map((p) => p.id)).toEqual([projetoA]);

    expect((await app.request(`/projetos/${projetoA}`, comCookie(tecnico))).status).toBe(200);
    const b = await app.request(`/projetos/${projetoB}`, comCookie(tecnico));
    expect(b.status).toBe(404);
    expect(await json(b)).toEqual({ data: [], meta: {}, erros: ["Projeto não encontrado"] });
    expect((await app.request(`/projetos/${projetoB}/equipe`, comCookie(tecnico))).status).toBe(404);
  });

  it("incluir a mesma pessoa de novo → 409; pessoa nova sem e-mail sai com email null", async () => {
    const dup = await app.request(
      `/projetos/${projetoA}/equipe`,
      comCookie(admin, { method: "POST", json: { userId: tecnicoId, tipo: "tecnico" } }),
    );
    expect(dup.status).toBe(409);

    const nova = await app.request(
      `/projetos/${projetoA}/equipe`,
      comCookie(admin, {
        method: "POST",
        json: {
          pessoa: { nome: `${PREFIXO_TESTE}Estudante`, telefone: "(69) 9 9999-0001" },
          tipo: "estudante",
        },
      }),
    );
    expect(nova.status).toBe(201);
    const membro = (await json<Membro & { telefone: string }>(nova)).data;
    expect(membro).toMatchObject({
      nome: `${PREFIXO_TESTE}Estudante`,
      email: null,
      telefone: "5569999990001",
    });
  });
});

describe("adesões", () => {
  let adesaoId: string;

  it("POST registra a adesão (201) e repetir → 409", async () => {
    const res = await app.request(
      `/projetos/${projetoA}/associacoes`,
      comCookie(admin, { method: "POST", json: { associacaoId, demandaInicial: "Trator" } }),
    );
    expect(res.status).toBe(201);
    const adesao = (await json<Adesao>(res)).data;
    expect(adesao).toMatchObject({ associacaoId, sigla: `${PREFIXO_TESTE}ASSOC`, demandaInicial: "Trator" });
    adesaoId = adesao.id;

    const dup = await app.request(
      `/projetos/${projetoA}/associacoes`,
      comCookie(admin, { method: "POST", json: { associacaoId } }),
    );
    expect(dup.status).toBe(409);
  });

  it("GET lista paginada da adesão com a busca", async () => {
    const res = await app.request(`/projetos/${projetoA}/associacoes?busca=assoc`, comCookie(tecnico));
    expect(res.status).toBe(200);
    const corpo = await json<Adesao[]>(res);
    expect(corpo.meta).toEqual({ total: 1, limit: 10, offset: 0 });
    expect(corpo.data[0].id).toBe(adesaoId);
  });

  it("DELETE desfaz a adesão (204)", async () => {
    const res = await app.request(
      `/projetos/${projetoA}/associacoes/${adesaoId}`,
      comCookie(admin, { method: "DELETE" }),
    );
    expect(res.status).toBe(204);
  });
});

describe("encerramento e exclusão", () => {
  it("projeto encerrado é somente leitura (409), mas pode ser reaberto", async () => {
    await app.request(
      `/projetos/${projetoA}`,
      comCookie(admin, { method: "PATCH", json: { situacao: "encerrado" } }),
    );
    const res = await app.request(
      `/projetos/${projetoA}/equipe`,
      comCookie(admin, { method: "POST", json: { pessoa: { nome: `${PREFIXO_TESTE}X` }, tipo: "tecnico" } }),
    );
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PROJETO_ENCERRADO" });

    const reabre = await app.request(
      `/projetos/${projetoA}`,
      comCookie(admin, { method: "PATCH", json: { situacao: "em_execucao" } }),
    );
    expect(reabre.status).toBe(200);
  });

  it("DELETE de projeto com equipe → 409; projeto vazio → 204 e depois 404", async () => {
    const emUso = await app.request(`/projetos/${projetoA}`, comCookie(admin, { method: "DELETE" }));
    expect(emUso.status).toBe(409);

    expect((await app.request(`/projetos/${projetoB}`, comCookie(admin, { method: "DELETE" }))).status).toBe(
      204,
    );
    expect((await app.request(`/projetos/${projetoB}`, comCookie(admin))).status).toBe(404);
  });

  it("trigger registrou a criação e a exclusão (soft delete) do projeto B com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "projetos"), eq(historicoAlteracao.registroId, projetoB)))
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
