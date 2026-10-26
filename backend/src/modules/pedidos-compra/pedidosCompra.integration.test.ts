import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { associacao } from "../../db/associacao.ts";
import { entrega } from "../../db/entrega.ts";
import { item } from "../../db/item.ts";
import { pedidoCompra } from "../../db/pedidoCompra.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Pedidos de compra pela API: número único entre os vivos (409), totais
 * consolidados das entregas, exclusão bloqueada com entregas (409) e o ESCOPO.
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Pedido = {
  id: string;
  projetoId: string;
  numero: string;
  descricao: string | null;
  fornecedor: string | null;
  situacao: string;
  dataPedido: string | null;
  totalEntregas: number;
  valorConsolidadoCentavos: number;
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-pedido-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const NUMERO = `${PREFIXO_TESTE}785275-${sufixo}`;
const NUMERO_2 = `${PREFIXO_TESTE}786066-${sufixo}`;
const NUMERO_B = `${PREFIXO_TESTE}900001-${sufixo}`;
const MUNICIPIO = 1100205;

let admin: string;
let tecnico: string;
let usuario: string;
let projetoA: string;
let projetoB: string;
let associacaoId: string;
let itemId: string;
let pedidoId: string;
let pedido2: string;
let pedidoB: string;

const criarProjeto = async (sigla: string) => {
  const res = await app.request(
    "/projetos",
    comCookie(admin, {
      method: "POST",
      json: { sigla, nome: `Projeto ${sigla}`, inicio: "2026-01-01", fim: "2027-12-31" },
    }),
  );
  return (await json<{ id: string }>(res)).data.id;
};

const novo = (corpo: Record<string, unknown>) =>
  app.request("/pedidos-compra", comCookie(admin, { method: "POST", json: corpo }));

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  usuario = await login("usuario@example.com");

  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: SENHA_TECNICO,
      name: "Técnico Pedidos",
      role: "tecnico" as "admin",
    },
  });
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}PA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}PB-${sufixo}`);
  await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: criado.user.id, tipo: "tecnico" } }),
  );

  [{ id: associacaoId }] = await db
    .insert(associacao)
    .values({ sigla: `${PREFIXO_TESTE}ASSOC`, municipioId: MUNICIPIO })
    .returning({ id: associacao.id });
  [{ id: itemId }] = await db
    .insert(item)
    .values({ descricao: `${PREFIXO_TESTE}Trator ${sufixo}`, tipo: "investimento", categoria: "maquina" })
    .returning({ id: item.id });
});

describe("gates", () => {
  it("GET /pedidos-compra sem cookie → 401", async () => {
    const res = await app.request("/pedidos-compra", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST com usuario@example.com (só leitura) → 403", async () => {
    const res = await app.request(
      "/pedidos-compra",
      comCookie(usuario, { method: "POST", json: { projetoId: projetoA, numero: NUMERO } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("CRUD", () => {
  it("POST cria o pedido aberto com totais zerados (201)", async () => {
    const res = await novo({
      projetoId: projetoA,
      numero: NUMERO,
      fornecedor: "Agro Máquinas Ltda",
      dataPedido: "2026-02-10",
    });
    expect(res.status).toBe(201);
    const corpo = await json<Pedido>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        numero: NUMERO,
        descricao: null,
        fornecedor: "Agro Máquinas Ltda",
        situacao: "aberto",
        dataPedido: "2026-02-10",
        totalEntregas: 0,
        valorConsolidadoCentavos: 0,
      },
      meta: {},
      erros: [],
    });
    pedidoId = corpo.data.id;

    const segundo = await novo({ projetoId: projetoA, numero: NUMERO_2, descricao: "Grade aradora" });
    pedido2 = (await json<Pedido>(segundo)).data.id;
    const b = await novo({ projetoId: projetoB, numero: NUMERO_B });
    pedidoB = (await json<Pedido>(b)).data.id;
  });

  it("POST com número já usado (mesmo em outro projeto) → 409", async () => {
    const res = await novo({ projetoId: projetoB, numero: NUMERO });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "PEDIDO_DUPLICADO" },
      erros: [`Já existe um pedido de compra nº ${NUMERO}`],
    });
  });

  it("POST sem número ou com situação inválida → 400", async () => {
    const res = await novo({ projetoId: projetoA, numero: "  " });
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { numero: "Informe o número do pedido" } });

    const situacao = await novo({ projetoId: projetoA, numero: `${NUMERO}-x`, situacao: "pago" });
    expect(situacao.status).toBe(400);
  });

  it("PATCH altera e preserva o resto; trocar para número de outro pedido → 409", async () => {
    const res = await app.request(
      `/pedidos-compra/${pedidoId}`,
      comCookie(admin, { method: "PATCH", json: { situacao: "em_compra" } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Pedido>(res)).data).toMatchObject({
      situacao: "em_compra",
      numero: NUMERO,
      fornecedor: "Agro Máquinas Ltda",
    });

    const dup = await app.request(
      `/pedidos-compra/${pedido2}`,
      comCookie(admin, { method: "PATCH", json: { numero: NUMERO } }),
    );
    expect(dup.status).toBe(409);
  });
});

describe("totais das entregas e exclusão", () => {
  it("totalEntregas e valorConsolidadoCentavos somam só as entregas vivas do pedido", async () => {
    await db.insert(entrega).values([
      { projetoId: projetoA, associacaoId, itemId, pedidoId, valorConsolidadoCentavos: 1000 },
      { projetoId: projetoA, associacaoId, itemId, pedidoId, valorConsolidadoCentavos: 2500 },
      { projetoId: projetoA, associacaoId, itemId, pedidoId }, // sem valor consolidado
      {
        projetoId: projetoA,
        associacaoId,
        itemId,
        pedidoId,
        valorConsolidadoCentavos: 9999,
        deletedAt: new Date(),
      },
    ]);
    const res = await app.request(`/pedidos-compra/${pedidoId}`, comCookie(admin));
    expect(res.status).toBe(200);
    expect((await json<Pedido>(res)).data).toMatchObject({
      totalEntregas: 3,
      valorConsolidadoCentavos: 3500,
    });
  });

  it("DELETE de pedido com entregas → 409", async () => {
    const res = await app.request(`/pedidos-compra/${pedidoId}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PEDIDO_EM_USO" });
  });

  it("sem entregas vivas: DELETE 204 → GET 404 → DELETE 404; o número volta a ficar livre", async () => {
    await db.update(entrega).set({ deletedAt: new Date() }).where(eq(entrega.pedidoId, pedidoId));

    const res = await app.request(`/pedidos-compra/${pedidoId}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect((await app.request(`/pedidos-compra/${pedidoId}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/pedidos-compra/${pedidoId}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(404);

    const [linha] = await db
      .select({ deletedAt: pedidoCompra.deletedAt })
      .from(pedidoCompra)
      .where(eq(pedidoCompra.id, pedidoId));
    expect(linha.deletedAt).toEqual(expect.any(Date));

    const denovo = await novo({ projetoId: projetoA, numero: NUMERO });
    expect(denovo.status).toBe(201);
  });
});

describe("listagem", () => {
  it("busca por descrição/fornecedor/número e filtro de situação", async () => {
    const busca = await json<Pedido[]>(await app.request("/pedidos-compra?busca=grade", comCookie(admin)));
    expect(busca.data.map((p) => p.id)).toEqual([pedido2]);

    const abertos = await json<Pedido[]>(
      await app.request(`/pedidos-compra?projetoId=${projetoB}&situacao=aberto`, comCookie(admin)),
    );
    expect(abertos.data.map((p) => p.id)).toEqual([pedidoB]);
    expect(abertos.meta).toEqual({ total: 1, limit: 10, offset: 0 });
  });

  it("sort=numero:desc ordena; campo fora da allowlist → 400", async () => {
    const res = await json<Pedido[]>(
      await app.request(`/pedidos-compra?projetoId=${projetoA}&sort=numero:desc`, comCookie(admin)),
    );
    // "…786066-…" > "…785275-…"
    expect(res.data.map((p) => p.numero)).toEqual([NUMERO_2, NUMERO]);

    const invalido = await app.request("/pedidos-compra?sort=fornecedor:asc", comCookie(admin));
    expect(invalido.status).toBe(400);
  });
});

describe("escopo por projeto", () => {
  it("técnico da equipe do A não vê o pedido do B (lista, id e ?projetoId)", async () => {
    const lista = await json<Pedido[]>(await app.request("/pedidos-compra", comCookie(tecnico)));
    expect(lista.data.map((p) => p.projetoId).every((id) => id === projetoA)).toBe(true);
    expect(lista.data.map((p) => p.id)).not.toContain(pedidoB);

    expect((await app.request(`/pedidos-compra/${pedidoB}`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/pedidos-compra?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
  });
});
