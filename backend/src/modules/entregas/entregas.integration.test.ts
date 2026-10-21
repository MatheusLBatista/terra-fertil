import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { associacao } from "../../db/associacao.ts";
import { entrega } from "../../db/entrega.ts";
import { item } from "../../db/item.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { ORIGIN, anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Entregas pela API: vínculos (adesão ATIVA da associação, item ativo, pedido
 * do mesmo projeto — 422), regra "entregue ⇔ data da entrega" (400), termo de
 * uso sem expor a key e o ESCOPO. Upload/download real do termo dependem do
 * storage (Garage) — aqui só os caminhos que não chegam ao bucket.
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Entrega = {
  id: string;
  projetoId: string;
  associacaoId: string;
  associacaoSigla: string;
  itemId: string;
  itemDescricao: string;
  pedidoId: string | null;
  pedidoNumero: string | null;
  lote: string | null;
  quantidade: number;
  situacao: string;
  dataEntrega: string | null;
  temTermoUso: boolean;
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-entrega-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const SIGLA_A = `${PREFIXO_TESTE}ASSOC-A`;
const ITEM = `${PREFIXO_TESTE}Trator 4x4 ${sufixo}`;
const NUMERO_A = `${PREFIXO_TESTE}785275-${sufixo}`;
const LOTE = "1ª Entrega de 2026";
const MUNICIPIO = 1100205;

let admin: string;
let tecnico: string;
let usuario: string;
let projetoA: string;
let projetoB: string;
let assocA: string; // adesão ativa ao A
let assocB: string; // adesão só ao B
let assocInativa: string; // adesão ao A marcada inativa
let itemId: string;
let itemInativo: string;
let pedidoA: string;
let pedidoB: string;
let entregaId: string;
let entregaB: string;

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

const aderir = async (projetoId: string, associacaoId: string, ativo = true) => {
  const res = await app.request(
    `/projetos/${projetoId}/associacoes`,
    comCookie(admin, { method: "POST", json: { associacaoId, ativo } }),
  );
  return (await json<{ id: string }>(res)).data.id;
};

const criarPedido = async (projetoId: string, numero: string) => {
  const res = await app.request(
    "/pedidos-compra",
    comCookie(admin, { method: "POST", json: { projetoId, numero } }),
  );
  return (await json<{ id: string }>(res)).data.id;
};

const nova = (corpo: Record<string, unknown>) =>
  app.request("/entregas", comCookie(admin, { method: "POST", json: corpo }));

const patch = (id: string, corpo: Record<string, unknown>) =>
  app.request(`/entregas/${id}`, comCookie(admin, { method: "PATCH", json: corpo }));

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  usuario = await login("usuario@example.com");

  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: SENHA_TECNICO,
      name: "Técnico Entregas",
      role: "tecnico" as "admin",
    },
  });
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}EA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}EB-${sufixo}`);
  await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: criado.user.id, tipo: "tecnico" } }),
  );

  [{ id: assocA }, { id: assocB }, { id: assocInativa }] = await db
    .insert(associacao)
    .values([
      { sigla: SIGLA_A, municipioId: MUNICIPIO },
      { sigla: `${PREFIXO_TESTE}ASSOC-B`, municipioId: MUNICIPIO },
      { sigla: `${PREFIXO_TESTE}ASSOC-INATIVA`, municipioId: MUNICIPIO },
    ])
    .returning({ id: associacao.id });
  await aderir(projetoA, assocA);
  await aderir(projetoB, assocB);
  await aderir(projetoA, assocInativa, false);

  [{ id: itemId }, { id: itemInativo }] = await db
    .insert(item)
    .values([
      { descricao: ITEM, tipo: "investimento" },
      { descricao: `${PREFIXO_TESTE}Item antigo ${sufixo}`, tipo: "custeio", ativo: false },
    ])
    .returning({ id: item.id });

  pedidoA = await criarPedido(projetoA, NUMERO_A);
  pedidoB = await criarPedido(projetoB, `${PREFIXO_TESTE}900001-${sufixo}`);
});

describe("gates", () => {
  it("GET /entregas sem cookie → 401", async () => {
    const res = await app.request("/entregas", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST com usuario@example.com (só leitura) → 403", async () => {
    const res = await app.request(
      "/entregas",
      comCookie(usuario, { method: "POST", json: { projetoId: projetoA, associacaoId: assocA, itemId } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("criação", () => {
  it("POST cria a demanda com sigla, item e número do pedido; sem key do termo (201)", async () => {
    const res = await nova({
      projetoId: projetoA,
      associacaoId: assocA,
      itemId,
      pedidoId: pedidoA,
      lote: LOTE,
      valorEstimadoCentavos: 25_000_000,
      dataPrevista: "2026-06-30",
    });
    expect(res.status).toBe(201);
    const corpo = await json<Entrega>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        associacaoId: assocA,
        associacaoSigla: SIGLA_A,
        itemId,
        itemDescricao: ITEM,
        pedidoId: pedidoA,
        pedidoNumero: NUMERO_A,
        lote: LOTE,
        quantidade: 1,
        valorEstimadoCentavos: 25_000_000,
        valorConsolidadoCentavos: null,
        situacao: "demandado",
        dataPrevista: "2026-06-30",
        dataEntrega: null,
        numeroSerie: null,
        observacao: null,
        temTermoUso: false,
      },
      meta: {},
      erros: [],
    });
    entregaId = corpo.data.id;

    const b = await app.request(
      "/entregas",
      comCookie(admin, { method: "POST", json: { projetoId: projetoB, associacaoId: assocB, itemId } }),
    );
    expect(b.status).toBe(201);
    entregaB = (await json<Entrega>(b)).data.id;
  });

  it("entregue sem data, data sem entregue e quantidade 0 → 400 com o campo marcado", async () => {
    const base = { projetoId: projetoA, associacaoId: assocA, itemId };

    const semData = await nova({ ...base, situacao: "entregue" });
    expect(semData.status).toBe(400);
    expect((await json(semData)).meta).toEqual({
      campos: { dataEntrega: "Informe a data da entrega para marcar como entregue" },
    });

    const semSituacao = await nova({ ...base, dataEntrega: "2026-07-01" });
    expect(semSituacao.status).toBe(400);
    expect((await json(semSituacao)).meta).toEqual({
      campos: { situacao: "A data da entrega só pode ser informada com a situação entregue" },
    });

    const zero = await nova({ ...base, quantidade: 0 });
    expect(zero.status).toBe(400);
    expect((await json(zero)).meta.campos).toHaveProperty("quantidade");
  });

  it("associação sem adesão ao projeto ou com adesão inativa → 422", async () => {
    const semAdesao = await nova({ projetoId: projetoA, associacaoId: assocB, itemId });
    expect(semAdesao.status).toBe(422);
    expect((await json(semAdesao)).meta).toEqual({ codigo: "SEM_ADESAO_ATIVA" });

    const inativa = await nova({ projetoId: projetoA, associacaoId: assocInativa, itemId });
    expect(inativa.status).toBe(422);
  });

  it("item inativo → 422; item inexistente → 404", async () => {
    const inativo = await nova({ projetoId: projetoA, associacaoId: assocA, itemId: itemInativo });
    expect(inativo.status).toBe(422);
    expect((await json(inativo)).meta).toEqual({ codigo: "ITEM_INATIVO" });

    const inexistente = await nova({ projetoId: projetoA, associacaoId: assocA, itemId: randomUUID() });
    expect(inexistente.status).toBe(404);
    expect((await json(inexistente)).erros).toEqual(["Item não encontrado"]);
  });

  it("pedido de outro projeto → 422", async () => {
    const res = await nova({ projetoId: projetoA, associacaoId: assocA, itemId, pedidoId: pedidoB });
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "PEDIDO_DE_OUTRO_PROJETO" });
  });
});

describe("alteração e a regra entregue ⇔ data da entrega", () => {
  it("PATCH para entregue sem data → 400; com data → 200 e preserva o resto", async () => {
    const semData = await patch(entregaId, { situacao: "entregue" });
    expect(semData.status).toBe(400);
    expect((await json(semData)).erros).toEqual(["Informe a data da entrega para marcar como entregue"]);

    const ok = await patch(entregaId, {
      situacao: "entregue",
      dataEntrega: "2026-07-01",
      numeroSerie: "CH-1",
    });
    expect(ok.status).toBe(200);
    expect((await json<Entrega>(ok)).data).toMatchObject({
      situacao: "entregue",
      dataEntrega: "2026-07-01",
      lote: LOTE,
      pedidoId: pedidoA,
    });
  });

  it("sair de entregue mantendo a data → 400; limpando a data → 200", async () => {
    const mantendo = await patch(entregaId, { situacao: "cancelado" });
    expect(mantendo.status).toBe(400);
    expect((await json(mantendo)).erros).toEqual([
      "A data da entrega só pode ser informada com a situação entregue",
    ]);

    const limpando = await patch(entregaId, { situacao: "comprado", dataEntrega: null });
    expect(limpando.status).toBe(200);
    expect((await json<Entrega>(limpando)).data).toMatchObject({ situacao: "comprado", dataEntrega: null });
  });

  it("PATCH trocando para pedido de outro projeto → 422", async () => {
    const res = await patch(entregaId, { pedidoId: pedidoB });
    expect(res.status).toBe(422);
  });
});

describe("listagem", () => {
  it("filtros por situação, lote, pedido e busca pela descrição do item", async () => {
    const porSituacao = await json<Entrega[]>(
      await app.request(`/entregas?projetoId=${projetoA}&situacao=comprado`, comCookie(admin)),
    );
    expect(porSituacao.data.map((e) => e.id)).toEqual([entregaId]);
    expect(porSituacao.meta).toEqual({ total: 1, limit: 10, offset: 0 });

    const porLote = await json<Entrega[]>(
      await app.request(`/entregas?lote=${encodeURIComponent("1ª entrega")}`, comCookie(admin)),
    );
    expect(porLote.data.map((e) => e.id)).toEqual([entregaId]);

    const porPedido = await json<Entrega[]>(
      await app.request(`/entregas?pedidoId=${pedidoA}`, comCookie(admin)),
    );
    expect(porPedido.data.map((e) => e.id)).toEqual([entregaId]);

    const busca = await json<Entrega[]>(
      await app.request(
        `/entregas?busca=${encodeURIComponent("trator 4x4")}&projetoId=${projetoB}`,
        comCookie(admin),
      ),
    );
    expect(busca.data.map((e) => e.id)).toEqual([entregaB]);
  });

  it("sort fora da allowlist → 400", async () => {
    const res = await app.request("/entregas?sort=lote:asc", comCookie(admin));
    expect(res.status).toBe(400);
    expect((await json(res)).erros[0]).toContain("Campo de ordenação inválido");
  });
});

describe("termo de uso (sem storage)", () => {
  it("GET/DELETE sem termo → 404", async () => {
    const get = await app.request(`/entregas/${entregaId}/termo-uso`, comCookie(admin));
    expect(get.status).toBe(404);
    expect(await json(get)).toEqual({ data: [], meta: {}, erros: ["Esta entrega não tem termo de uso"] });

    const del = await app.request(`/entregas/${entregaId}/termo-uso`, comCookie(admin, { method: "DELETE" }));
    expect(del.status).toBe(404);
  });

  it("POST sem multipart → 400; arquivo de tipo não aceito → 415", async () => {
    const semMultipart = await app.request(
      `/entregas/${entregaId}/termo-uso`,
      comCookie(admin, { method: "POST", json: {} }),
    );
    expect(semMultipart.status).toBe(400);

    const form = new FormData();
    form.append("arquivo", new File(["texto"], "termo.txt", { type: "text/plain" }));
    const tipo = await app.request(`/entregas/${entregaId}/termo-uso`, {
      method: "POST",
      headers: { Cookie: admin, Origin: ORIGIN },
      body: form,
    });
    expect(tipo.status).toBe(415);
  });

  it("com key gravada: temTermoUso true sem expor a key; DELETE remove (204)", async () => {
    await db
      .update(entrega)
      .set({ termoUsoKey: `entregas/${entregaId}/termo-uso-1.pdf` })
      .where(eq(entrega.id, entregaId));

    const res = await app.request(`/entregas/${entregaId}`, comCookie(admin));
    const data = (await json<Entrega>(res)).data;
    expect(data.temTermoUso).toBe(true);
    expect(data).not.toHaveProperty("termoUsoKey");
    expect(JSON.stringify(data)).not.toContain("termo-uso-1.pdf");

    const del = await app.request(`/entregas/${entregaId}/termo-uso`, comCookie(admin, { method: "DELETE" }));
    expect(del.status).toBe(204);
    const depois = await app.request(`/entregas/${entregaId}`, comCookie(admin));
    expect((await json<Entrega>(depois)).data.temTermoUso).toBe(false);
  });
});

describe("escopo por projeto", () => {
  it("técnico da equipe do A só vê as entregas do A; a do B → 404", async () => {
    const lista = await json<Entrega[]>(await app.request("/entregas", comCookie(tecnico)));
    expect(lista.data.map((e) => e.id)).toEqual([entregaId]);

    expect((await app.request(`/entregas/${entregaB}`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/entregas/${entregaB}/termo-uso`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/entregas?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
  });
});

describe("exclusão", () => {
  it("DELETE 204 → GET 404 → DELETE 404; a linha fica com deletedAt", async () => {
    const res = await app.request(`/entregas/${entregaId}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect((await app.request(`/entregas/${entregaId}`, comCookie(admin))).status).toBe(404);
    expect((await app.request(`/entregas/${entregaId}`, comCookie(admin, { method: "DELETE" }))).status).toBe(
      404,
    );

    const [linha] = await db
      .select({ deletedAt: entrega.deletedAt })
      .from(entrega)
      .where(eq(entrega.id, entregaId));
    expect(linha.deletedAt).toEqual(expect.any(Date));
  });
});
