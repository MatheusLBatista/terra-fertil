import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { diagnosticoAssociacao } from "../../db/diagnosticoAssociacao.ts";
import { diagnosticoOpcao } from "../../db/diagnosticoOpcao.ts";
import { evento } from "../../db/evento.ts";
import { projeto } from "../../db/projeto.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Opções de diagnóstico: catálogo global agrupado (sem projeto/escopo). Nome
 * único dentro do grupo; exclusão bloqueada se marcada em diagnóstico ou tema
 * de evento. Os `it` são encadeados.
 */
type Opcao = {
  id: string;
  grupo: string;
  nome: string;
  permiteDetalhe: boolean;
  ordem: number;
  ativo: boolean;
};

const CAFE = `${PREFIXO_TESTE}Café`;
const OUTRO = `${PREFIXO_TESTE}Outro`;
const ADUBACAO = `${PREFIXO_TESTE}Adubação verde`;

let gestor: string;
let usuario: string;
let gestorId: string;
let cafeId: string;
let outroId: string;
let soloCafeId: string;
let temaId: string;

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  gestor = await login("gestor@example.com");
  usuario = await login("usuario@example.com");
  [{ id: gestorId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "gestor@example.com"));
});

const criar = (cookie: string, corpo: unknown) =>
  app.request("/opcoes-diagnostico", comCookie(cookie, { method: "POST", json: corpo }));

describe("gates", () => {
  it("GET sem cookie → 401", async () => {
    const res = await app.request("/opcoes-diagnostico", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST com usuario@example.com (só lê) → 403; GET → 200", async () => {
    const negado = await criar(usuario, { grupo: "atividade_produtiva", nome: CAFE });
    expect(negado.status).toBe(403);
    expect((await app.request("/opcoes-diagnostico", comCookie(usuario))).status).toBe(200);
  });
});

describe("CRUD", () => {
  it("POST cria com os padrões (201)", async () => {
    const res = await criar(gestor, { grupo: "atividade_produtiva", nome: CAFE, ordem: 1 });
    expect(res.status).toBe(201);
    const corpo = await json<Opcao>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        grupo: "atividade_produtiva",
        nome: CAFE,
        permiteDetalhe: false,
        ordem: 1,
        ativo: true,
      },
      meta: {},
      erros: [],
    });
    cafeId = corpo.data.id;

    const outro = await criar(gestor, {
      grupo: "atividade_produtiva",
      nome: OUTRO,
      permiteDetalhe: true,
      ordem: 99,
    });
    outroId = (await json<Opcao>(outro)).data.id;
    const tema = await criar(gestor, { grupo: "tema_capacitacao", nome: ADUBACAO });
    temaId = (await json<Opcao>(tema)).data.id;
  });

  it("o mesmo nome em OUTRO grupo é permitido (201); no mesmo grupo, outra caixa → 409", async () => {
    const outroGrupo = await criar(gestor, { grupo: "problema_solo", nome: CAFE });
    expect(outroGrupo.status).toBe(201);
    soloCafeId = (await json<Opcao>(outroGrupo)).data.id;

    const dup = await criar(gestor, { grupo: "atividade_produtiva", nome: CAFE.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toEqual({
      data: [],
      meta: { codigo: "OPCAO_DIAGNOSTICO_DUPLICADA" },
      erros: [`Já existe a opção "${CAFE.toUpperCase()}" neste grupo`],
    });
  });

  it("POST com grupo inválido ou sem nome → 400", async () => {
    const grupo = await criar(gestor, { grupo: "inexistente", nome: "X" });
    expect(grupo.status).toBe(400);
    expect(Object.keys((await json<unknown>(grupo)).meta.campos as object)).toEqual(["grupo"]);

    const nome = await criar(gestor, { grupo: "problema_solo", nome: "" });
    expect(nome.status).toBe(400);
    expect((await json(nome)).meta).toEqual({ campos: { nome: "Informe o nome" } });
  });

  it("GET padrão por grupo e ordem; filtros e sort", async () => {
    const lista = await json<Opcao[]>(await app.request("/opcoes-diagnostico", comCookie(usuario)));
    expect(lista.meta).toEqual({ total: 4, limit: 10, offset: 0 });
    // Ordem do enum: atividade_produtiva → problema_solo → tema_capacitacao
    expect(lista.data.map((o) => o.id)).toEqual([cafeId, outroId, soloCafeId, temaId]);

    const grupo = await json<Opcao[]>(
      await app.request("/opcoes-diagnostico?grupo=problema_solo", comCookie(gestor)),
    );
    expect(grupo.data.map((o) => o.id)).toEqual([soloCafeId]);

    const busca = await json<Opcao[]>(await app.request("/opcoes-diagnostico?busca=café", comCookie(gestor)));
    expect(busca.data.map((o) => o.id).sort()).toEqual([cafeId, soloCafeId].sort());

    const porOrdem = await json<Opcao[]>(
      await app.request("/opcoes-diagnostico?grupo=atividade_produtiva&sort=ordem:desc", comCookie(gestor)),
    );
    expect(porOrdem.data.map((o) => o.id)).toEqual([outroId, cafeId]);

    expect((await app.request("/opcoes-diagnostico?sort=ativo:asc", comCookie(gestor))).status).toBe(400);
    expect((await app.request("/opcoes-diagnostico?grupo=xyz", comCookie(gestor))).status).toBe(400);
  });

  it("PATCH altera e preserva o resto; ativo=false some do filtro ativo=true", async () => {
    const res = await app.request(
      `/opcoes-diagnostico/${outroId}`,
      comCookie(gestor, { method: "PATCH", json: { ativo: false } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Opcao>(res)).data).toEqual({
      id: outroId,
      grupo: "atividade_produtiva",
      nome: OUTRO,
      permiteDetalhe: true,
      ordem: 99,
      ativo: false,
    });

    const ativos = await json<Opcao[]>(
      await app.request("/opcoes-diagnostico?grupo=atividade_produtiva&ativo=true", comCookie(gestor)),
    );
    expect(ativos.data.map((o) => o.id)).toEqual([cafeId]);
  });
});

describe("exclusão", () => {
  it("opção marcada em diagnóstico → 409; não muda de grupo", async () => {
    const [{ id: associacaoId }] = await db
      .insert(associacao)
      .values({ sigla: `${PREFIXO_TESTE}ASSOC`, municipioId: 1100205 })
      .returning({ id: associacao.id });
    await db.insert(diagnosticoAssociacao).values({ associacaoId, coletadoEm: "2026-03-10" });
    await db.insert(diagnosticoOpcao).values({ associacaoId, opcaoId: cafeId });

    const res = await app.request(`/opcoes-diagnostico/${cafeId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "OPCAO_DIAGNOSTICO_EM_USO" });

    const grupo = await app.request(
      `/opcoes-diagnostico/${cafeId}`,
      comCookie(gestor, { method: "PATCH", json: { grupo: "apoio_necessario" } }),
    );
    expect(grupo.status).toBe(409);
  });

  it("opção usada como tema de evento → 409", async () => {
    const [{ id: projetoId }] = await db
      .insert(projeto)
      .values({ sigla: `${PREFIXO_TESTE}P`, nome: "Projeto", inicio: "2026-01-01", fim: "2026-12-31" })
      .returning({ id: projeto.id });
    await db.insert(evento).values({
      projetoId,
      titulo: "Oficina de adubação",
      tipo: "oficina",
      temaId,
      municipioId: 1100205,
      inicio: new Date("2026-04-01T12:00:00Z"),
      fim: new Date("2026-04-01T17:00:00Z"),
    });

    const res = await app.request(`/opcoes-diagnostico/${temaId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "OPCAO_DIAGNOSTICO_EM_USO" },
      erros: [`"${ADUBACAO}" já foi usada em 1 diagnóstico(s) ou evento(s) — desative-a em vez de excluir`],
    });
  });

  it("opção sem uso: DELETE → 204, depois 404; o nome volta a ficar livre", async () => {
    const res = await app.request(`/opcoes-diagnostico/${outroId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(204);

    const get = await app.request(`/opcoes-diagnostico/${outroId}`, comCookie(gestor));
    expect(get.status).toBe(404);
    expect(await json(get)).toEqual({ data: [], meta: {}, erros: ["Opção de diagnóstico não encontrada"] });
    expect(
      (await app.request(`/opcoes-diagnostico/${outroId}`, comCookie(gestor, { method: "DELETE" }))).status,
    ).toBe(404);

    const [linha] = await db
      .select({ deletedAt: opcaoDiagnostico.deletedAt })
      .from(opcaoDiagnostico)
      .where(eq(opcaoDiagnostico.id, outroId));
    expect(linha.deletedAt).toEqual(expect.any(Date));

    expect((await criar(gestor, { grupo: "atividade_produtiva", nome: OUTRO })).status).toBe(201);
  });

  it("trigger registrou INSERT, UPDATE e DELETE com o gestor", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(eq(historicoAlteracao.tabela, "opcoes_diagnostico"), eq(historicoAlteracao.registroId, outroId)),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === gestorId)).toBe(true);
  });
});
