import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { eventoParticipante } from "../../db/eventoParticipante.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";
import EventosRepository from "./eventos.repository.ts";

/**
 * Eventos pela API: CRUD, regras das referências (tema do grupo certo,
 * associação com adesão ativa, município), lista de presença substituída pelo
 * PUT sem duplicar, contagens da Meta 6 e o ESCOPO por projeto.
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Evento = {
  id: string;
  projetoId: string;
  titulo: string;
  temaId: string | null;
  temaNome: string | null;
  associacaoSigla: string | null;
  municipioNome: string;
  inicio: string;
  fim: string;
  situacao: string;
  totalParticipantes: number;
  totalPresentes: number;
};
type Participante = {
  produtorId: string;
  nome: string;
  telefone: string | null;
  associacaoId: string | null;
  associacaoSigla: string | null;
  presente: boolean;
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tec-evento-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const PORTO_VELHO = 1100205;

let admin: string;
let tecnico: string;
let tecnicoId: string;
let projetoA: string;
let projetoB: string;
let assocComAdesao: string;
let assocSemAdesao: string;
let temaId: string;
let temaInativoId: string;
let outraOpcaoId: string;
const produtores: Record<"p1" | "p2" | "p3" | "inativo", string> = { p1: "", p2: "", p3: "", inativo: "" };
let eventoId: string;
let eventoB: string;

const novoEvento = (projetoId: string, extra: Record<string, unknown> = {}) => ({
  projetoId,
  titulo: `${PREFIXO_TESTE}Oficina de compostagem`,
  tipo: "oficina",
  municipioId: PORTO_VELHO,
  inicio: "2026-03-10T08:00:00-04:00",
  fim: "2026-03-10T17:00:00-04:00",
  cargaHoraria: 8,
  ...extra,
});

async function criarProjeto(sigla: string) {
  const res = await app.request(
    "/projetos",
    comCookie(admin, {
      method: "POST",
      json: { sigla, nome: `Projeto ${sigla}`, inicio: "2026-01-01", fim: "2027-12-31" },
    }),
  );
  return (await json<{ id: string }>(res)).data.id;
}

async function criarProdutor(nome: string, ativo = true) {
  const [u] = await db
    .insert(user)
    .values({ id: randomUUID(), name: nome, email: `${nome.toLowerCase()}@example.com` })
    .returning({ id: user.id });
  const [p] = await db.insert(produtor).values({ userId: u.id, ativo }).returning({ id: produtor.id });
  return p.id;
}

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");

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

  projetoA = await criarProjeto(`${PREFIXO_TESTE}EVA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}EVB-${sufixo}`);
  await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: tecnicoId, tipo: "tecnico" } }),
  );

  [{ id: assocComAdesao }, { id: assocSemAdesao }] = await db
    .insert(associacao)
    .values([
      { sigla: `${PREFIXO_TESTE}ANFITRIA`, municipioId: PORTO_VELHO },
      { sigla: `${PREFIXO_TESTE}DE-FORA`, municipioId: PORTO_VELHO },
    ])
    .returning({ id: associacao.id });
  await app.request(
    `/projetos/${projetoA}/associacoes`,
    comCookie(admin, { method: "POST", json: { associacaoId: assocComAdesao } }),
  );

  [{ id: temaId }, { id: temaInativoId }, { id: outraOpcaoId }] = await db
    .insert(opcaoDiagnostico)
    .values([
      { grupo: "tema_capacitacao", nome: `${PREFIXO_TESTE}Compostagem` },
      { grupo: "tema_capacitacao", nome: `${PREFIXO_TESTE}Antigo`, ativo: false },
      { grupo: "atividade_produtiva", nome: `${PREFIXO_TESTE}Café` },
    ])
    .returning({ id: opcaoDiagnostico.id });

  produtores.p1 = await criarProdutor(`${PREFIXO_TESTE}Ana-${sufixo}`);
  produtores.p2 = await criarProdutor(`${PREFIXO_TESTE}Bruno-${sufixo}`);
  produtores.p3 = await criarProdutor(`${PREFIXO_TESTE}Carla-${sufixo}`);
  produtores.inativo = await criarProdutor(`${PREFIXO_TESTE}Davi-${sufixo}`, false);
  // A propriedade da Ana é atendida pela anfitriã → associação principal dela
  await db
    .insert(propriedade)
    .values({ produtorId: produtores.p1, associacaoId: assocComAdesao, municipioId: PORTO_VELHO });
});

describe("gates", () => {
  it("GET /eventos sem cookie → 401", async () => {
    const res = await app.request("/eventos", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /eventos com usuario@example.com → 403", async () => {
    const usuario = await login("usuario@example.com");
    const res = await app.request(
      "/eventos",
      comCookie(usuario, { method: "POST", json: novoEvento(projetoA) }),
    );
    expect(res.status).toBe(403);
  });
});

describe("CRUD de eventos", () => {
  it("POST cria o evento com tema e anfitriã (201)", async () => {
    const res = await app.request(
      "/eventos",
      comCookie(tecnico, {
        method: "POST",
        json: novoEvento(projetoA, { temaId, associacaoId: assocComAdesao, local: "Barracão" }),
      }),
    );
    expect(res.status).toBe(201);
    const corpo = await json<Evento>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        titulo: `${PREFIXO_TESTE}Oficina de compostagem`,
        tipo: "oficina",
        temaId,
        temaNome: `${PREFIXO_TESTE}Compostagem`,
        associacaoId: assocComAdesao,
        associacaoSigla: `${PREFIXO_TESTE}ANFITRIA`,
        municipioId: PORTO_VELHO,
        municipioNome: expect.any(String),
        local: "Barracão",
        inicio: "2026-03-10T12:00:00.000Z",
        fim: "2026-03-10T21:00:00.000Z",
        cargaHoraria: 8,
        instrutor: null,
        situacao: "planejado",
        relato: null,
        totalParticipantes: 0,
        totalPresentes: 0,
      },
      meta: {},
      erros: [],
    });
    eventoId = corpo.data.id;
  });

  it("fim antes do início → 400 com o campo marcado; carga horária zero → 400", async () => {
    const res = await app.request(
      "/eventos",
      comCookie(admin, {
        method: "POST",
        json: novoEvento(projetoA, { fim: "2026-03-09T08:00:00-04:00" }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { fim: "O fim não pode ser antes do início" } });

    const carga = await app.request(
      "/eventos",
      comCookie(admin, { method: "POST", json: novoEvento(projetoA, { cargaHoraria: 0 }) }),
    );
    expect(carga.status).toBe(400);
  });

  it("tema de outro grupo ou inativo → 422; associação sem adesão ativa → 422; município inexistente → 404", async () => {
    const outroGrupo = await app.request(
      "/eventos",
      comCookie(admin, { method: "POST", json: novoEvento(projetoA, { temaId: outraOpcaoId }) }),
    );
    expect(outroGrupo.status).toBe(422);
    expect(await json(outroGrupo)).toEqual({
      data: [],
      meta: { codigo: "TEMA_INVALIDO" },
      erros: ["A opção informada não é um tema de capacitação"],
    });

    const inativo = await app.request(
      "/eventos",
      comCookie(admin, { method: "POST", json: novoEvento(projetoA, { temaId: temaInativoId }) }),
    );
    expect(inativo.status).toBe(422);
    expect((await json(inativo)).meta).toEqual({ codigo: "TEMA_INATIVO" });

    const semAdesao = await app.request(
      "/eventos",
      comCookie(admin, { method: "POST", json: novoEvento(projetoA, { associacaoId: assocSemAdesao }) }),
    );
    expect(semAdesao.status).toBe(422);
    expect((await json(semAdesao)).meta).toEqual({ codigo: "ASSOCIACAO_SEM_ADESAO" });

    const municipio = await app.request(
      "/eventos",
      comCookie(admin, { method: "POST", json: novoEvento(projetoA, { municipioId: 9_999_999 }) }),
    );
    expect(municipio.status).toBe(404);
    expect((await json(municipio)).erros).toEqual(["Município não encontrado"]);
  });

  it("PATCH altera e preserva o resto; fim antes do início guardado → 400", async () => {
    const res = await app.request(
      `/eventos/${eventoId}`,
      comCookie(tecnico, { method: "PATCH", json: { situacao: "realizado", instrutor: "Eng. Agr. Maria" } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Evento>(res)).data).toMatchObject({
      situacao: "realizado",
      instrutor: "Eng. Agr. Maria",
      temaId,
      inicio: "2026-03-10T12:00:00.000Z",
    });

    const periodo = await app.request(
      `/eventos/${eventoId}`,
      comCookie(tecnico, { method: "PATCH", json: { fim: "2026-03-01T00:00:00Z" } }),
    );
    expect(periodo.status).toBe(400);
  });

  it("GET lista com filtros (busca, de/ate, situação); sort fora da allowlist → 400", async () => {
    const res = await app.request(
      "/eventos?busca=compostagem&de=2026-03-10&ate=2026-03-10&situacao=realizado",
      comCookie(admin),
    );
    expect(res.status).toBe(200);
    const corpo = await json<Evento[]>(res);
    expect(corpo.meta).toEqual({ total: 1, limit: 10, offset: 0 });
    expect(corpo.data[0].id).toBe(eventoId);

    const foraDoPeriodo = await json(await app.request("/eventos?de=2026-03-11", comCookie(admin)));
    expect(foraDoPeriodo.meta).toMatchObject({ total: 0 });

    const sort = await app.request("/eventos?sort=local:asc", comCookie(admin));
    expect(sort.status).toBe(400);
  });
});

describe("participantes", () => {
  it("PUT define a lista com presença; GET traz nome e associação principal", async () => {
    const res = await app.request(
      `/eventos/${eventoId}/participantes`,
      comCookie(tecnico, {
        method: "PUT",
        json: {
          participantes: [
            { produtorId: produtores.p1, presente: true },
            { produtorId: produtores.p2, presente: false },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const lista = (await json<Participante[]>(res)).data;
    expect(lista).toHaveLength(2);
    expect(lista.find((p) => p.produtorId === produtores.p1)).toEqual({
      produtorId: produtores.p1,
      nome: `${PREFIXO_TESTE}Ana-${sufixo}`,
      telefone: null,
      associacaoId: assocComAdesao,
      associacaoSigla: `${PREFIXO_TESTE}ANFITRIA`,
      presente: true,
    });
    expect(lista.find((p) => p.produtorId === produtores.p2)).toMatchObject({
      associacaoId: null,
      presente: false,
    });
  });

  it("PUT substitui o conjunto: tira quem saiu, atualiza quem ficou, inclui o novo — sem duplicar", async () => {
    const res = await app.request(
      `/eventos/${eventoId}/participantes`,
      comCookie(tecnico, {
        method: "PUT",
        json: {
          participantes: [
            { produtorId: produtores.p2, presente: true },
            { produtorId: produtores.p3, presente: true },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const lista = (await json<Participante[]>(res)).data;
    expect(lista.map((p) => [p.produtorId, p.presente]).sort()).toEqual(
      [
        [produtores.p2, true],
        [produtores.p3, true],
      ].sort(),
    );

    // P1 ficou excluído (soft delete) e P2 continua com UMA linha só
    const linhas = await db
      .select({
        produtorId: eventoParticipante.produtorId,
        deletedAt: eventoParticipante.deletedAt,
      })
      .from(eventoParticipante)
      .where(eq(eventoParticipante.eventoId, eventoId));
    expect(linhas).toHaveLength(3);
    expect(linhas.find((l) => l.produtorId === produtores.p1)?.deletedAt).toEqual(expect.any(Date));
    expect(linhas.filter((l) => l.produtorId === produtores.p2)).toHaveLength(1);

    const evento = (await json<Evento>(await app.request(`/eventos/${eventoId}`, comCookie(tecnico)))).data;
    expect(evento).toMatchObject({ totalParticipantes: 2, totalPresentes: 2 });
  });

  it("PUT repetido com o mesmo conjunto não cria linhas novas", async () => {
    await app.request(
      `/eventos/${eventoId}/participantes`,
      comCookie(tecnico, {
        method: "PUT",
        json: {
          participantes: [
            { produtorId: produtores.p2, presente: true },
            { produtorId: produtores.p3, presente: true },
          ],
        },
      }),
    );
    const vivas = await db
      .select({ id: eventoParticipante.id })
      .from(eventoParticipante)
      .where(and(eq(eventoParticipante.eventoId, eventoId), isNull(eventoParticipante.deletedAt)));
    expect(vivas).toHaveLength(2);
  });

  it("produtor inativo → 422; inexistente → 404; repetido na lista → 400", async () => {
    const inativo = await app.request(
      `/eventos/${eventoId}/participantes`,
      comCookie(tecnico, {
        method: "PUT",
        json: { participantes: [{ produtorId: produtores.inativo, presente: true }] },
      }),
    );
    expect(inativo.status).toBe(422);
    expect((await json(inativo)).meta).toEqual({ codigo: "PRODUTOR_INATIVO" });

    const inexistente = await app.request(
      `/eventos/${eventoId}/participantes`,
      comCookie(tecnico, {
        method: "PUT",
        json: { participantes: [{ produtorId: randomUUID(), presente: true }] },
      }),
    );
    expect(inexistente.status).toBe(404);

    const repetido = await app.request(
      `/eventos/${eventoId}/participantes`,
      comCookie(tecnico, {
        method: "PUT",
        json: {
          participantes: [
            { produtorId: produtores.p2, presente: true },
            { produtorId: produtores.p2, presente: false },
          ],
        },
      }),
    );
    expect(repetido.status).toBe(400);
  });

  it("contagens da Meta 6: eventos realizados e produtores distintos presentes", async () => {
    const repo = new EventosRepository();
    expect(await repo.contarRealizados(projetoA)).toBe(1);
    expect(await repo.contarCapacitados(projetoA)).toBe(2);
  });
});

describe("escopo por projeto", () => {
  it("evento do projeto B é invisível ao técnico (lista, detalhe, participantes e filtro → 404)", async () => {
    const criado = await app.request(
      "/eventos",
      comCookie(admin, {
        method: "POST",
        json: novoEvento(projetoB, { titulo: `${PREFIXO_TESTE}Palestra B` }),
      }),
    );
    expect(criado.status).toBe(201);
    eventoB = (await json<Evento>(criado)).data.id;

    const lista = await json<Evento[]>(await app.request("/eventos", comCookie(tecnico)));
    expect(lista.data.map((e) => e.id)).toEqual([eventoId]);

    const detalhe = await app.request(`/eventos/${eventoB}`, comCookie(tecnico));
    expect(detalhe.status).toBe(404);
    expect(await json(detalhe)).toEqual({ data: [], meta: {}, erros: ["Evento não encontrado"] });
    expect((await app.request(`/eventos/${eventoB}/participantes`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/eventos?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);

    const naoCria = await app.request(
      "/eventos",
      comCookie(tecnico, { method: "POST", json: novoEvento(projetoB) }),
    );
    expect(naoCria.status).toBe(404);
  });

  it("projeto encerrado é somente leitura (409)", async () => {
    await app.request(
      `/projetos/${projetoB}`,
      comCookie(admin, { method: "PATCH", json: { situacao: "encerrado" } }),
    );
    const res = await app.request(
      `/eventos/${eventoB}`,
      comCookie(admin, { method: "PATCH", json: { titulo: "Outro" } }),
    );
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PROJETO_ENCERRADO" });
  });
});

describe("exclusão", () => {
  it("DELETE 204 → GET 404 → DELETE de novo 404; a lista de presença fica", async () => {
    const res = await app.request(`/eventos/${eventoId}`, comCookie(tecnico, { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect((await app.request(`/eventos/${eventoId}`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/eventos/${eventoId}`, comCookie(tecnico, { method: "DELETE" }))).status).toBe(
      404,
    );

    const vivas = await db
      .select({ id: eventoParticipante.id })
      .from(eventoParticipante)
      .where(and(eq(eventoParticipante.eventoId, eventoId), isNull(eventoParticipante.deletedAt)));
    expect(vivas).toHaveLength(2);
    expect(await new EventosRepository().contarCapacitados(projetoA)).toBe(0);
  });

  it("trigger registrou INSERT, UPDATE e DELETE do evento", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "eventos"), eq(historicoAlteracao.registroId, eventoId)))
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === tecnicoId)).toBe(true);
  });
});
