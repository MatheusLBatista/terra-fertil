import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { entrega } from "../../db/entrega.ts";
import { item } from "../../db/item.ts";
import { projeto } from "../../db/projeto.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Itens: catálogo global de máquinas, implementos e insumos (sem projeto/escopo).
 * Descrição única sem caixa; exclusão bloqueada se houver entregas. `it` encadeados.
 */
type Item = {
  id: string;
  descricao: string;
  tipo: "investimento" | "custeio";
  unidade: string;
  valorReferenciaCentavos: number | null;
  ativo: boolean;
};

const TRATOR = `${PREFIXO_TESTE}Trator de pneu 4x4`;
const GRADE = `${PREFIXO_TESTE}Grade aradora 12 discos`;
const CALCARIO = `${PREFIXO_TESTE}Calcário dolomítico`;

let gestor: string;
let usuario: string;
let gestorId: string;
let tratorId: string;
let gradeId: string;
let calcarioId: string;

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
  app.request("/itens", comCookie(cookie, { method: "POST", json: corpo }));

describe("gates", () => {
  it("GET sem cookie → 401", async () => {
    const res = await app.request("/itens", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST com usuario@example.com (só lê) → 403; GET → 200", async () => {
    expect(
      (await criar(usuario, { descricao: TRATOR, tipo: "investimento", categoria: "maquina" })).status,
    ).toBe(403);
    expect((await app.request("/itens", comCookie(usuario))).status).toBe(200);
  });
});

describe("CRUD", () => {
  it("POST cria com os padrões (201)", async () => {
    const res = await criar(gestor, { descricao: TRATOR, tipo: "investimento", categoria: "maquina" });
    expect(res.status).toBe(201);
    const corpo = await json<Item>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        descricao: TRATOR,
        tipo: "investimento",
        categoria: "maquina",
        unidade: "un",
        valorReferenciaCentavos: null,
        ativo: true,
      },
      meta: {},
      erros: [],
    });
    tratorId = corpo.data.id;

    gradeId = (
      await json<Item>(
        await criar(gestor, {
          descricao: GRADE,
          tipo: "investimento",
          categoria: "maquina",
          valorReferenciaCentavos: 2_500_000,
        }),
      )
    ).data.id;
    calcarioId = (
      await json<Item>(
        await criar(gestor, {
          descricao: CALCARIO,
          tipo: "custeio",
          categoria: "insumo",
          unidade: "t",
          valorReferenciaCentavos: 18_000,
        }),
      )
    ).data.id;
  });

  it("valor negativo ou fracionário → 400; tipo inválido → 400", async () => {
    const negativo = await criar(gestor, {
      descricao: "X",
      tipo: "custeio",
      categoria: "insumo",
      valorReferenciaCentavos: -1,
    });
    expect(negativo.status).toBe(400);
    expect(Object.keys((await json<unknown>(negativo)).meta.campos as object)).toEqual([
      "valorReferenciaCentavos",
    ]);
    expect(
      (
        await criar(gestor, {
          descricao: "X",
          tipo: "custeio",
          categoria: "insumo",
          valorReferenciaCentavos: 10.5,
        })
      ).status,
    ).toBe(400);
    expect((await criar(gestor, { descricao: "X", tipo: "outro" })).status).toBe(400);
  });

  it("POST com a mesma descrição em outra caixa → 409", async () => {
    const res = await criar(gestor, {
      descricao: TRATOR.toUpperCase(),
      tipo: "custeio",
      categoria: "insumo",
    });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "ITEM_DUPLICADO" },
      erros: [`Já existe um item "${TRATOR.toUpperCase()}"`],
    });
  });

  it("GET lista; filtros e sort", async () => {
    const lista = await json<Item[]>(await app.request("/itens", comCookie(usuario)));
    expect(lista.meta).toEqual({ total: 3, limit: 10, offset: 0 });

    const custeio = await json<Item[]>(await app.request("/itens?tipo=custeio", comCookie(gestor)));
    expect(custeio.data.map((i) => i.id)).toEqual([calcarioId]);

    const busca = await json<Item[]>(await app.request("/itens?busca=GRADE", comCookie(gestor)));
    expect(busca.data.map((i) => i.id)).toEqual([gradeId]);

    // Ordem do enum item_tipo: investimento → custeio
    const porTipo = await json<Item[]>(await app.request("/itens?sort=tipo:desc", comCookie(gestor)));
    expect(porTipo.data[0].id).toBe(calcarioId);

    const porDescricao = await json<Item[]>(
      await app.request("/itens?sort=descricao:desc", comCookie(gestor)),
    );
    const ids = porDescricao.data.map((i) => i.id);
    expect(ids.indexOf(tratorId)).toBeLessThan(ids.indexOf(gradeId));

    expect((await app.request("/itens?sort=valorReferenciaCentavos:asc", comCookie(gestor))).status).toBe(
      400,
    );
  });

  it("PATCH altera e preserva o resto; limpa o valor com null; descrição de outro → 409", async () => {
    const res = await app.request(
      `/itens/${gradeId}`,
      comCookie(gestor, { method: "PATCH", json: { valorReferenciaCentavos: null, ativo: false } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Item>(res)).data).toEqual({
      id: gradeId,
      descricao: GRADE,
      tipo: "investimento",
      categoria: "maquina",
      unidade: "un",
      valorReferenciaCentavos: null,
      ativo: false,
    });

    const ativos = await json<Item[]>(await app.request("/itens?ativo=false", comCookie(gestor)));
    expect(ativos.data.map((i) => i.id)).toEqual([gradeId]);

    const dup = await app.request(
      `/itens/${gradeId}`,
      comCookie(gestor, { method: "PATCH", json: { descricao: CALCARIO.toLowerCase() } }),
    );
    expect(dup.status).toBe(409);
    expect((await json(dup)).meta).toEqual({ codigo: "ITEM_DUPLICADO" });
  });
});

describe("exclusão", () => {
  it("item com entrega → 409", async () => {
    const [{ id: projetoId }] = await db
      .insert(projeto)
      .values({ sigla: `${PREFIXO_TESTE}P`, nome: "Projeto", inicio: "2026-01-01", fim: "2026-12-31" })
      .returning({ id: projeto.id });
    const [{ id: associacaoId }] = await db
      .insert(associacao)
      .values({ sigla: `${PREFIXO_TESTE}ASSOC`, municipioId: 1100205 })
      .returning({ id: associacao.id });
    await db.insert(entrega).values({ projetoId, associacaoId, itemId: tratorId });

    const res = await app.request(`/itens/${tratorId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "ITEM_EM_USO" },
      erros: [`"${TRATOR}" já tem 1 entrega(s) registrada(s) — desative-o em vez de excluir`],
    });
  });

  it("item sem entrega: DELETE → 204, depois 404; a descrição volta a ficar livre", async () => {
    const res = await app.request(`/itens/${gradeId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(204);

    const get = await app.request(`/itens/${gradeId}`, comCookie(gestor));
    expect(get.status).toBe(404);
    expect(await json(get)).toEqual({ data: [], meta: {}, erros: ["Item não encontrado"] });
    expect((await app.request(`/itens/${gradeId}`, comCookie(gestor, { method: "DELETE" }))).status).toBe(
      404,
    );

    const [linha] = await db.select({ deletedAt: item.deletedAt }).from(item).where(eq(item.id, gradeId));
    expect(linha.deletedAt).toEqual(expect.any(Date));

    expect(
      (await criar(gestor, { descricao: GRADE, tipo: "investimento", categoria: "maquina" })).status,
    ).toBe(201);
  });

  it("trigger registrou INSERT, UPDATE e DELETE com o gestor", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "itens"), eq(historicoAlteracao.registroId, gradeId)))
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === gestorId)).toBe(true);
  });
});
