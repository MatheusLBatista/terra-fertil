import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { diagnosticoOpcao } from "../../db/diagnosticoOpcao.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { ORIGIN, anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Visitas pela API: regras de alvo/adesão/equipe (422), PATCH com campos fixos
 * e realizadaEm, equipe da visita, diagnóstico da propriedade com opções,
 * bloqueio do DELETE e o ESCOPO (técnico só vê as visitas dos projetos da
 * equipe dele). Os `it` são encadeados (usam os ids criados antes).
 * O upload com sucesso fica de fora: depende do storage (Garage) no ar.
 */
type Visita = {
  id: string;
  projetoId: string;
  projetoSigla: string;
  tipo: string;
  situacao: string;
  associacaoId: string | null;
  associacaoSigla: string | null;
  propriedadeId: string | null;
  propriedadeNome: string | null;
  produtorNome: string | null;
  visitaAnteriorId: string | null;
  data: string;
  realizadaEm: string | null;
  tecnicoId: string;
  tecnicoNome: string;
  relato: string | null;
};
type Membro = { id: string; userId: string; nome: string; email: string | null };
type Diagnostico = {
  visitaId: string;
  areaProdutivaHa: number | null;
  possuiEnergia: boolean | null;
  comentarios: string | null;
  opcoes: { opcaoId: string; grupo: string; nome: string; detalhe: string | null }[];
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tec-visitas-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const SIGLA_ASSOC = `${PREFIXO_TESTE}ASSOC-${sufixo}`;

let admin: string;
let adminId: string;
let tecnico: string;
let tecnicoId: string;
let foraId: string;
let projetoA: string;
let projetoB: string;
let associacaoId: string;
let associacaoSemAdesao: string;
let propriedadeId: string;
let opcaoCafe: string;
let opcaoOutroSolo: string;
let opcaoCapacitacao: string;

// Visitas criadas ao longo do arquivo
let inicial: string;
let diagnostico: string;
let assistencia: string;
let acompanhamento: string;
let visitaB: string;

const novoProjeto = (sigla: string) => ({
  sigla,
  nome: `Projeto ${sigla}`,
  inicio: "2026-01-01",
  fim: "2027-12-31",
});

const post = (cookie: string, path: string, corpo: unknown) =>
  app.request(path, comCookie(cookie, { method: "POST", json: corpo }));
const patch = (cookie: string, path: string, corpo: unknown) =>
  app.request(path, comCookie(cookie, { method: "PATCH", json: corpo }));
const put = (cookie: string, path: string, corpo: unknown) =>
  app.request(path, comCookie(cookie, { method: "PUT", json: corpo }));

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
      name: "Técnico Visitas",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  // Técnico que NÃO está na equipe de projeto nenhum
  [{ id: foraId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}Fora da equipe`,
      email: `${PREFIXO_TESTE}fora-${sufixo}@example.com`,
      role: "tecnico",
    })
    .returning({ id: user.id });

  projetoA = (
    await json<{ id: string }>(await post(admin, "/projetos", novoProjeto(`${PREFIXO_TESTE}VA-${sufixo}`)))
  ).data.id;
  projetoB = (
    await json<{ id: string }>(await post(admin, "/projetos", novoProjeto(`${PREFIXO_TESTE}VB-${sufixo}`)))
  ).data.id;
  await post(admin, `/projetos/${projetoA}/equipe`, { userId: tecnicoId, tipo: "tecnico" });

  [{ id: associacaoId }, { id: associacaoSemAdesao }] = await db
    .insert(associacao)
    .values([
      { sigla: SIGLA_ASSOC, municipioId: 1100205 },
      { sigla: `${PREFIXO_TESTE}SEM-${sufixo}`, municipioId: 1100205 },
    ])
    .returning({ id: associacao.id });
  await post(admin, `/projetos/${projetoA}/associacoes`, { associacaoId });
  await post(admin, `/projetos/${projetoB}/associacoes`, { associacaoId });

  const [{ id: produtorUserId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}Dona Maria`,
      email: `${PREFIXO_TESTE}maria-${sufixo}@example.com`,
      role: "produtor",
    })
    .returning({ id: user.id });
  const [{ id: produtorId }] = await db
    .insert(produtor)
    .values({ userId: produtorUserId })
    .returning({ id: produtor.id });
  [{ id: propriedadeId }] = await db
    .insert(propriedade)
    .values({ produtorId, associacaoId, nome: "Sítio Boa Esperança", municipioId: 1100205 })
    .returning({ id: propriedade.id });

  [{ id: opcaoCafe }, { id: opcaoOutroSolo }, { id: opcaoCapacitacao }] = await db
    .insert(opcaoDiagnostico)
    .values([
      { grupo: "atividade_produtiva", nome: "Café", ordem: 1 },
      { grupo: "problema_solo", nome: "Outro", permiteDetalhe: true, ordem: 99 },
      { grupo: "tema_capacitacao", nome: "Gestão", ordem: 1 },
    ])
    .returning({ id: opcaoDiagnostico.id });
});

describe("gates", () => {
  it("GET /visitas sem cookie → 401", async () => {
    const res = await app.request("/visitas", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /visitas com usuario@example.com (só lê) → 403", async () => {
    const usuario = await login("usuario@example.com");
    const res = await post(usuario, "/visitas", {});
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Acesso negado: permissão insuficiente"] });
  });
});

describe("criar e regras de negócio", () => {
  it("POST visita inicial realizada sem realizadaEm → 201 com a data-hora preenchida", async () => {
    const res = await post(admin, "/visitas", {
      projetoId: projetoA,
      tipo: "inicial_associacao",
      associacaoId,
      situacao: "realizada",
      data: "2026-03-10",
      tecnicoId,
      latitude: -12.74,
      longitude: -60.13,
      relato: "Reunião com a diretoria",
    });
    expect(res.status).toBe(201);
    const corpo = await json<Visita>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        projetoSigla: `${PREFIXO_TESTE}VA-${sufixo}`,
        tipo: "inicial_associacao",
        situacao: "realizada",
        associacaoId,
        associacaoSigla: SIGLA_ASSOC,
        propriedadeId: null,
        propriedadeNome: null,
        produtorNome: null,
        visitaAnteriorId: null,
        data: "2026-03-10",
        realizadaEm: expect.any(String),
        tecnicoId,
        tecnicoNome: "Técnico Visitas",
        latitude: -12.74,
        longitude: -60.13,
        relato: "Reunião com a diretoria",
        noticiaUrl: null,
      },
      meta: {},
      erros: [],
    });
    inicial = corpo.data.id;
  });

  it("alvo errado para o tipo → 400 com o campo marcado", async () => {
    const res = await post(admin, "/visitas", {
      projetoId: projetoA,
      tipo: "inicial_associacao",
      propriedadeId,
      data: "2026-03-10",
      tecnicoId,
    });
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({
      campos: {
        associacaoId: "A visita inicial é na associação: informe a associação (e não a propriedade)",
      },
    });
  });

  it("associação sem adesão ao projeto → 422", async () => {
    const res = await post(admin, "/visitas", {
      projetoId: projetoA,
      tipo: "inicial_associacao",
      associacaoId: associacaoSemAdesao,
      data: "2026-03-10",
      tecnicoId,
    });
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "SEM_ADESAO" },
      erros: ["A associação não participa deste projeto"],
    });
  });

  it("técnico fora da equipe do projeto → 422", async () => {
    const res = await post(admin, "/visitas", {
      projetoId: projetoA,
      tipo: "inicial_associacao",
      associacaoId,
      data: "2026-03-10",
      tecnicoId: foraId,
    });
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "FORA_DA_EQUIPE" },
      erros: ["O técnico não faz parte da equipe deste projeto"],
    });
  });

  it("visitas na propriedade: diagnóstico (responsável que vê todos os projetos) e assistência (pelo técnico)", async () => {
    const diag = await post(admin, "/visitas", {
      projetoId: projetoA,
      tipo: "diagnostico_propriedade",
      propriedadeId,
      data: "2026-03-12",
      tecnicoId: adminId,
    });
    expect(diag.status).toBe(201);
    const d = (await json<Visita>(diag)).data;
    expect(d).toMatchObject({
      propriedadeNome: "Sítio Boa Esperança",
      produtorNome: `${PREFIXO_TESTE}Dona Maria`,
      associacaoSigla: SIGLA_ASSOC,
      situacao: "agendada",
      realizadaEm: null,
    });
    diagnostico = d.id;

    const at = await post(tecnico, "/visitas", {
      projetoId: projetoA,
      tipo: "assistencia_tecnica",
      propriedadeId,
      data: "2026-04-01",
      tecnicoId,
    });
    expect(at.status).toBe(201);
    assistencia = (await json<Visita>(at)).data.id;
  });

  it("acompanhamento: anterior precisa ser assistência/diagnóstico da mesma propriedade (422); válido → 201", async () => {
    const corpo = {
      projetoId: projetoA,
      tipo: "acompanhamento",
      propriedadeId,
      data: "2026-05-01",
      tecnicoId,
    };
    const invalida = await post(admin, "/visitas", { ...corpo, visitaAnteriorId: inicial });
    expect(invalida.status).toBe(422);
    expect((await json(invalida)).meta).toEqual({ codigo: "VISITA_ANTERIOR_INVALIDA" });

    const res = await post(admin, "/visitas", { ...corpo, visitaAnteriorId: assistencia });
    expect(res.status).toBe(201);
    const v = (await json<Visita>(res)).data;
    expect(v.visitaAnteriorId).toBe(assistencia);
    acompanhamento = v.id;
  });

  it("visita no projeto B (fora do escopo do técnico)", async () => {
    const res = await post(admin, "/visitas", {
      projetoId: projetoB,
      tipo: "assistencia_tecnica",
      propriedadeId,
      data: "2026-04-15",
      tecnicoId: adminId,
    });
    expect(res.status).toBe(201);
    visitaB = (await json<Visita>(res)).data.id;
  });
});

describe("alterar", () => {
  it("PATCH para realizada preenche realizadaEm e preserva o resto; voltar para agendada limpa", async () => {
    const realizada = await patch(admin, `/visitas/${acompanhamento}`, {
      situacao: "realizada",
      relato: "Calagem aplicada",
    });
    expect(realizada.status).toBe(200);
    expect((await json<Visita>(realizada)).data).toMatchObject({
      situacao: "realizada",
      realizadaEm: expect.any(String),
      relato: "Calagem aplicada",
      visitaAnteriorId: assistencia,
      data: "2026-05-01",
    });

    const agendada = await patch(admin, `/visitas/${acompanhamento}`, { situacao: "agendada" });
    expect((await json<Visita>(agendada)).data).toMatchObject({ situacao: "agendada", realizadaEm: null });
  });

  it("PATCH mudando o tipo → 400; reenviar o mesmo tipo é aceito", async () => {
    const res = await patch(admin, `/visitas/${acompanhamento}`, { tipo: "assistencia_tecnica" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      data: [],
      meta: {},
      erros: ["O tipo da visita não pode ser alterado"],
    });

    const mesmo = await patch(admin, `/visitas/${acompanhamento}`, { tipo: "acompanhamento", propriedadeId });
    expect(mesmo.status).toBe(200);
  });

  it("PATCH trocando o técnico por alguém fora da equipe → 422", async () => {
    const res = await patch(admin, `/visitas/${acompanhamento}`, { tecnicoId: foraId });
    expect(res.status).toBe(422);
  });
});

describe("listagem e escopo", () => {
  it("GET lista paginada com filtro, busca e ordenação; sort fora da allowlist → 400", async () => {
    const res = await app.request(
      `/visitas?projetoId=${projetoA}&busca=maria&sort=data:asc`,
      comCookie(admin),
    );
    expect(res.status).toBe(200);
    const corpo = await json<Visita[]>(res);
    expect(corpo.meta).toEqual({ total: 3, limit: 10, offset: 0 });
    expect(corpo.data.map((v) => v.id)).toEqual([diagnostico, assistencia, acompanhamento]);

    const tipo = await json<Visita[]>(
      await app.request(`/visitas?tipo=inicial_associacao&associacaoId=${associacaoId}`, comCookie(admin)),
    );
    expect(tipo.data.map((v) => v.id)).toEqual([inicial]);

    const sort = await app.request("/visitas?sort=relato:asc", comCookie(admin));
    expect(sort.status).toBe(400);
    expect((await json(sort)).erros[0]).toContain("Campo de ordenação inválido");
  });

  it("técnico vê só as visitas do projeto A; a do B responde 404", async () => {
    const lista = await json<Visita[]>(await app.request("/visitas", comCookie(tecnico)));
    expect(lista.meta.total).toBe(4);
    expect(lista.data.every((v) => v.projetoId === projetoA)).toBe(true);

    const b = await app.request(`/visitas/${visitaB}`, comCookie(tecnico));
    expect(b.status).toBe(404);
    expect(await json(b)).toEqual({ data: [], meta: {}, erros: ["Visita não encontrada"] });
    expect((await app.request(`/visitas?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/visitas/${visitaB}/equipe`, comCookie(tecnico))).status).toBe(404);
  });
});

describe("equipe da visita", () => {
  it("PUT com pessoa fora da equipe do projeto → 422", async () => {
    const res = await put(admin, `/visitas/${assistencia}/equipe`, { userIds: [foraId] });
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "FORA_DA_EQUIPE" },
      erros: [`${PREFIXO_TESTE}Fora da equipe não faz parte da equipe deste projeto`],
    });
  });

  it("PUT substitui o conjunto (o responsável é ignorado) e o GET confirma", async () => {
    const res = await put(admin, `/visitas/${assistencia}/equipe`, { userIds: [adminId, tecnicoId] });
    expect(res.status).toBe(200);
    expect((await json<Membro[]>(res)).data.map((m) => m.userId)).toEqual([adminId]);

    const lida = await json<Membro[]>(
      await app.request(`/visitas/${assistencia}/equipe`, comCookie(tecnico)),
    );
    expect(lida.data).toEqual([
      {
        id: expect.any(String),
        visitaId: assistencia,
        userId: adminId,
        nome: expect.any(String),
        email: expect.any(String),
      },
    ]);

    const vazia = await put(admin, `/visitas/${assistencia}/equipe`, { userIds: [] });
    expect((await json<Membro[]>(vazia)).data).toEqual([]);
  });
});

describe("anexos (sem storage)", () => {
  it("POST com tipo não aceito → 415 antes de tocar o storage; GET lista vazia", async () => {
    const form = new FormData();
    form.append("arquivo", new File(["texto"], "nota.txt", { type: "text/plain" }));
    const res = await app.request(`/visitas/${assistencia}/anexos`, {
      method: "POST",
      body: form,
      headers: { Cookie: admin, Origin: ORIGIN },
    });
    expect(res.status).toBe(415);
    expect((await json(res)).erros).toEqual([
      "Tipo de arquivo não permitido. Use PDF ou imagem (JPEG, PNG, WebP, GIF).",
    ]);

    const lista = await app.request(`/visitas/${assistencia}/anexos`, comCookie(tecnico));
    expect(await json(lista)).toEqual({ data: [], meta: {}, erros: [] });
  });
});

describe("diagnóstico da propriedade", () => {
  it("visita de outro tipo → 422; diagnóstico ainda vazio → 404", async () => {
    const tipo = await app.request(`/visitas/${inicial}/diagnostico`, comCookie(admin));
    expect(tipo.status).toBe(422);
    expect((await json(tipo)).meta).toEqual({ codigo: "TIPO_VISITA_INVALIDO" });

    const vazio = await app.request(`/visitas/${diagnostico}/diagnostico`, comCookie(admin));
    expect(vazio.status).toBe(404);
    expect(await json(vazio)).toEqual({ data: [], meta: {}, erros: ["Diagnóstico ainda não preenchido"] });
  });

  it("opção de grupo da associação → 422; detalhe em opção que não aceita → 422", async () => {
    const grupo = await put(admin, `/visitas/${diagnostico}/diagnostico`, {
      opcoes: [{ opcaoId: opcaoCapacitacao }],
    });
    expect(grupo.status).toBe(422);
    expect((await json(grupo)).erros).toEqual([
      'A opção "Gestão" não se aplica ao diagnóstico da propriedade',
    ]);

    const detalhe = await put(admin, `/visitas/${diagnostico}/diagnostico`, {
      opcoes: [{ opcaoId: opcaoCafe, detalhe: "arábica" }],
    });
    expect(detalhe.status).toBe(422);
  });

  it("PUT grava o questionário com as opções (200) e o GET devolve o mesmo", async () => {
    const res = await put(admin, `/visitas/${diagnostico}/diagnostico`, {
      areaProdutivaHa: 12.5,
      possuiEnergia: true,
      analiseSoloRecente: "nao",
      opcoes: [{ opcaoId: opcaoCafe }, { opcaoId: opcaoOutroSolo, detalhe: "Erosão em sulcos" }],
    });
    expect(res.status).toBe(200);
    const corpo = await json<Diagnostico>(res);
    expect(corpo.data).toMatchObject({
      visitaId: diagnostico,
      areaProdutivaHa: 12.5,
      possuiEnergia: true,
      analiseSoloRecente: "nao",
      comentarios: null,
      opcoes: [
        { opcaoId: opcaoCafe, grupo: "atividade_produtiva", nome: "Café", detalhe: null },
        { opcaoId: opcaoOutroSolo, grupo: "problema_solo", nome: "Outro", detalhe: "Erosão em sulcos" },
      ],
    });

    const lido = await json<Diagnostico>(
      await app.request(`/visitas/${diagnostico}/diagnostico`, comCookie(tecnico)),
    );
    expect(lido.data).toEqual(corpo.data);
  });

  it("PUT de novo substitui: campo ausente fica nulo e a opção desmarcada sai (soft delete)", async () => {
    const res = await put(admin, `/visitas/${diagnostico}/diagnostico`, {
      comentarios: "Revisado",
      opcoes: [{ opcaoId: opcaoOutroSolo, detalhe: "Compactação" }],
    });
    expect(res.status).toBe(200);
    const d = (await json<Diagnostico>(res)).data;
    expect(d).toMatchObject({ areaProdutivaHa: null, possuiEnergia: null, comentarios: "Revisado" });
    expect(d.opcoes).toEqual([
      { opcaoId: opcaoOutroSolo, grupo: "problema_solo", nome: "Outro", detalhe: "Compactação" },
    ]);

    const cafe = await db
      .select({ deletedAt: diagnosticoOpcao.deletedAt })
      .from(diagnosticoOpcao)
      .where(and(eq(diagnosticoOpcao.visitaId, diagnostico), eq(diagnosticoOpcao.opcaoId, opcaoCafe)));
    expect(cafe).toEqual([{ deletedAt: expect.any(Date) }]);
    const vivas = await db
      .select({ id: diagnosticoOpcao.id })
      .from(diagnosticoOpcao)
      .where(and(eq(diagnosticoOpcao.visitaId, diagnostico), isNull(diagnosticoOpcao.deletedAt)));
    expect(vivas).toHaveLength(1);
  });
});

describe("encerramento e exclusão", () => {
  it("projeto encerrado é somente leitura (409)", async () => {
    await patch(admin, `/projetos/${projetoA}`, { situacao: "encerrado" });
    const res = await patch(admin, `/visitas/${inicial}`, { relato: "x" });
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PROJETO_ENCERRADO" });
    await patch(admin, `/projetos/${projetoA}`, { situacao: "em_execucao" });
  });

  it("DELETE da assistência que é origem de um acompanhamento → 409", async () => {
    const res = await app.request(`/visitas/${assistencia}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "VISITA_EM_USO" });
  });

  it("DELETE do acompanhamento → 204; depois GET e DELETE → 404", async () => {
    const del = await app.request(`/visitas/${acompanhamento}`, comCookie(admin, { method: "DELETE" }));
    expect(del.status).toBe(204);
    expect((await app.request(`/visitas/${acompanhamento}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/visitas/${acompanhamento}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(404);
  });

  it("trigger registrou criação, alterações e exclusão do acompanhamento com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "visitas"), eq(historicoAlteracao.registroId, acompanhamento)))
      .orderBy(asc(historicoAlteracao.id));
    const operacoes = linhas.map((l) => l.operacao);
    expect(operacoes[0]).toBe("INSERT");
    expect(operacoes).toContain("UPDATE");
    expect(operacoes.at(-1)).toBe("DELETE");
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
