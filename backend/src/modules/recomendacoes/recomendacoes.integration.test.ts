import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Recomendações pela API: só em visita de assistência técnica (422), a
 * propriedade vem da visita, a verificação é um acompanhamento da mesma
 * propriedade/projeto (422) e o ESCOPO segue o projeto da visita.
 * Os `it` são encadeados (usam os ids criados antes).
 */
type Recomendacao = {
  id: string;
  visitaId: string;
  visitaData: string;
  projetoId: string;
  propriedadeId: string;
  propriedadeNome: string | null;
  produtorNome: string;
  categoria: string;
  cultura: string | null;
  descricao: string;
  prazo: string | null;
  situacao: string;
  verificadaEmVisitaId: string | null;
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tec-recom-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";

let admin: string;
let adminId: string;
let tecnico: string;
let tecnicoId: string;
let projetoA: string;
let projetoB: string;
let propriedadeP: string;
let propriedadeQ: string;

// Visitas de apoio
let assistenciaA: string;
let acompanhamentoA: string;
let acompanhamentoOutraPropriedade: string;
let diagnosticoA: string;
let assistenciaB: string;

let recomendacaoA: string;
let recomendacaoB: string;

const post = (cookie: string, path: string, corpo: unknown) =>
  app.request(path, comCookie(cookie, { method: "POST", json: corpo }));
const patch = (cookie: string, path: string, corpo: unknown) =>
  app.request(path, comCookie(cookie, { method: "PATCH", json: corpo }));

async function novaVisita(corpo: Record<string, unknown>) {
  const res = await post(admin, "/visitas", { tecnicoId: adminId, ...corpo });
  if (res.status !== 201) throw new Error(`Visita de apoio falhou (${res.status}): ${await res.text()}`);
  return (await json<{ id: string }>(res)).data.id;
}

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
      name: "Técnico Recomendações",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  const projeto = async (sigla: string) =>
    (
      await json<{ id: string }>(
        await post(admin, "/projetos", {
          sigla,
          nome: `Projeto ${sigla}`,
          inicio: "2026-01-01",
          fim: "2027-12-31",
        }),
      )
    ).data.id;
  projetoA = await projeto(`${PREFIXO_TESTE}RA-${sufixo}`);
  projetoB = await projeto(`${PREFIXO_TESTE}RB-${sufixo}`);
  await post(admin, `/projetos/${projetoA}/equipe`, { userId: tecnicoId, tipo: "tecnico" });

  const [{ id: associacaoId }] = await db
    .insert(associacao)
    .values({ sigla: `${PREFIXO_TESTE}ASSOC-${sufixo}`, municipioId: 1100205 })
    .returning({ id: associacao.id });
  await post(admin, `/projetos/${projetoA}/associacoes`, { associacaoId });
  await post(admin, `/projetos/${projetoB}/associacoes`, { associacaoId });

  const [{ id: produtorUserId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}Seu João`,
      email: `${PREFIXO_TESTE}joao-${sufixo}@example.com`,
      role: "produtor",
    })
    .returning({ id: user.id });
  const [{ id: produtorId }] = await db
    .insert(produtor)
    .values({ userId: produtorUserId })
    .returning({ id: produtor.id });
  [{ id: propriedadeP }, { id: propriedadeQ }] = await db
    .insert(propriedade)
    .values([
      { produtorId, associacaoId, nome: "Sítio P", municipioId: 1100205 },
      { produtorId, associacaoId, nome: "Sítio Q", municipioId: 1100205 },
    ])
    .returning({ id: propriedade.id });

  const naPropriedade = { projetoId: projetoA, propriedadeId: propriedadeP };
  assistenciaA = await novaVisita({ ...naPropriedade, tipo: "assistencia_tecnica", data: "2026-04-01" });
  acompanhamentoA = await novaVisita({
    ...naPropriedade,
    tipo: "acompanhamento",
    data: "2026-06-01",
    visitaAnteriorId: assistenciaA,
  });
  diagnosticoA = await novaVisita({ ...naPropriedade, tipo: "diagnostico_propriedade", data: "2026-03-01" });
  acompanhamentoOutraPropriedade = await novaVisita({
    projetoId: projetoA,
    propriedadeId: propriedadeQ,
    tipo: "acompanhamento",
    data: "2026-06-02",
  });
  assistenciaB = await novaVisita({
    projetoId: projetoB,
    propriedadeId: propriedadeP,
    tipo: "assistencia_tecnica",
    data: "2026-04-10",
  });
});

describe("gates", () => {
  it("GET /recomendacoes sem cookie → 401", async () => {
    const res = await app.request("/recomendacoes", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /recomendacoes com usuario@example.com (só lê) → 403", async () => {
    const usuario = await login("usuario@example.com");
    const res = await post(usuario, "/recomendacoes", {
      visitaId: assistenciaA,
      categoria: "calagem",
      descricao: "x",
    });
    expect(res.status).toBe(403);
  });
});

describe("criar", () => {
  it("POST numa visita que não é de assistência técnica → 422", async () => {
    const res = await post(admin, "/recomendacoes", {
      visitaId: diagnosticoA,
      categoria: "calagem",
      descricao: "Aplicar calcário",
    });
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "TIPO_VISITA_INVALIDO" },
      erros: ["Recomendações são registradas em visitas de assistência técnica"],
    });
  });

  it("POST sem descrição e com categoria fora da lista → 400", async () => {
    const res = await post(admin, "/recomendacoes", {
      visitaId: assistenciaA,
      categoria: "poda",
      descricao: " ",
    });
    expect(res.status).toBe(400);
    const campos = (await json(res)).meta.campos as Record<string, string>;
    expect(Object.keys(campos).sort()).toEqual(["categoria", "descricao"]);
  });

  it("POST cria (201) com a propriedade derivada da visita", async () => {
    const res = await post(tecnico, "/recomendacoes", {
      visitaId: assistenciaA,
      categoria: "calagem",
      cultura: "Café",
      descricao: "Aplicar 2 t/ha de calcário dolomítico",
      prazo: "2026-05-15",
    });
    expect(res.status).toBe(201);
    const corpo = await json<Recomendacao>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        visitaId: assistenciaA,
        visitaData: "2026-04-01",
        projetoId: projetoA,
        propriedadeId: propriedadeP,
        propriedadeNome: "Sítio P",
        produtorNome: `${PREFIXO_TESTE}Seu João`,
        categoria: "calagem",
        cultura: "Café",
        descricao: "Aplicar 2 t/ha de calcário dolomítico",
        prazo: "2026-05-15",
        situacao: "pendente",
        verificadaEmVisitaId: null,
      },
      meta: {},
      erros: [],
    });
    recomendacaoA = corpo.data.id;

    const b = await post(admin, "/recomendacoes", {
      visitaId: assistenciaB,
      categoria: "adubacao",
      descricao: "Adubação de cobertura",
    });
    expect(b.status).toBe(201);
    recomendacaoB = (await json<Recomendacao>(b)).data.id;
  });

  it("técnico não cria recomendação em visita de projeto fora do escopo (404)", async () => {
    const res = await post(tecnico, "/recomendacoes", {
      visitaId: assistenciaB,
      categoria: "gestao",
      descricao: "x",
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Visita não encontrada"] });
  });
});

describe("verificação no acompanhamento", () => {
  it("verificada em visita de outra propriedade ou que não é acompanhamento → 422", async () => {
    const outra = await patch(admin, `/recomendacoes/${recomendacaoA}`, {
      verificadaEmVisitaId: acompanhamentoOutraPropriedade,
    });
    expect(outra.status).toBe(422);
    expect((await json(outra)).meta).toEqual({ codigo: "VERIFICACAO_INVALIDA" });

    const tipo = await patch(admin, `/recomendacoes/${recomendacaoA}`, {
      verificadaEmVisitaId: assistenciaA,
    });
    expect(tipo.status).toBe(422);
  });

  it("PATCH marca como adotada no acompanhamento da mesma propriedade e preserva o resto", async () => {
    const res = await patch(tecnico, `/recomendacoes/${recomendacaoA}`, {
      situacao: "adotada",
      verificadaEmVisitaId: acompanhamentoA,
    });
    expect(res.status).toBe(200);
    expect((await json<Recomendacao>(res)).data).toMatchObject({
      situacao: "adotada",
      verificadaEmVisitaId: acompanhamentoA,
      categoria: "calagem",
      prazo: "2026-05-15",
    });
  });
});

describe("listagem e escopo", () => {
  it("GET filtra por situação e ordena; sort fora da allowlist → 400", async () => {
    const adotadas = await json<Recomendacao[]>(
      await app.request("/recomendacoes?situacao=adotada", comCookie(admin)),
    );
    expect(adotadas.meta).toEqual({ total: 1, limit: 10, offset: 0 });
    expect(adotadas.data[0].id).toBe(recomendacaoA);

    const porPrazo = await json<Recomendacao[]>(
      await app.request(`/recomendacoes?propriedadeId=${propriedadeP}&sort=prazo:asc`, comCookie(admin)),
    );
    // Prazo nulo vai para o fim no asc do Postgres
    expect(porPrazo.data.map((r) => r.id)).toEqual([recomendacaoA, recomendacaoB]);

    const sort = await app.request("/recomendacoes?sort=descricao:asc", comCookie(admin));
    expect(sort.status).toBe(400);
    expect((await json(sort)).erros[0]).toContain("Campo de ordenação inválido");
  });

  it("técnico vê só as recomendações do projeto A; as do B respondem 404", async () => {
    const lista = await json<Recomendacao[]>(await app.request("/recomendacoes", comCookie(tecnico)));
    expect(lista.data.map((r) => r.id)).toEqual([recomendacaoA]);

    expect((await app.request(`/recomendacoes/${recomendacaoB}`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/recomendacoes?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
  });
});

describe("exclusão", () => {
  it("visita com recomendação não pode ser excluída (409)", async () => {
    const res = await app.request(`/visitas/${assistenciaB}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "VISITA_EM_USO" });
  });

  it("DELETE → 204; depois GET e DELETE → 404", async () => {
    const del = await app.request(`/recomendacoes/${recomendacaoB}`, comCookie(admin, { method: "DELETE" }));
    expect(del.status).toBe(204);
    expect((await app.request(`/recomendacoes/${recomendacaoB}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/recomendacoes/${recomendacaoB}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(404);
  });

  it("trigger registrou INSERT e DELETE da recomendação com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(eq(historicoAlteracao.tabela, "recomendacoes"), eq(historicoAlteracao.registroId, recomendacaoB)),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
