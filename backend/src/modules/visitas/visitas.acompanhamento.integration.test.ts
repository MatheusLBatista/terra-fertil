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
import { item } from "../../db/item.ts";
import { entrega } from "../../db/entrega.ts";
import { visitaAnexo } from "../../db/visitaAnexo.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { ORIGIN, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Acompanhamento na associação (reunião de 23/10): demanda → fornecimento →
 * visita de acompanhamento que confere os itens entregues, com observação e
 * fotos. Cobre o alvo do acompanhamento (associação OU propriedade), as regras
 * da verificação (422/404/409), o vínculo da foto com o item e o bloqueio da
 * exclusão de visita/entrega já conferidas. Os `it` são encadeados.
 * O upload com sucesso fica de fora (depende do Garage): a foto é gravada direto no banco.
 */
type Visita = {
  id: string;
  tipo: string;
  associacaoId: string | null;
  associacaoSigla: string | null;
  propriedadeId: string | null;
};
type ItemVerificado = {
  id: string;
  visitaId: string;
  entregaId: string;
  itemDescricao: string;
  itemCategoria: string;
  quantidade: number;
  lote: string | null;
  dataEntrega: string | null;
  observacao: string | null;
  fotos: number;
};

const sufixo = randomUUID().slice(0, 8);
const SIGLA = `${PREFIXO_TESTE}ACRUB-${sufixo}`;

let admin: string;
let adminId: string;
let projetoA: string;
let projetoB: string;
let associacaoId: string;
let outraAssociacao: string;
let propriedadeId: string;
let calcario: string;
let entregue: string;
let demandado: string;
let deOutraAssociacao: string;
let deOutroProjeto: string;

let acompanhamento: string;
let acompanhamentoPropriedade: string;
let verificacaoId: string;

const post = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "POST", json: corpo }));
const put = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "PUT", json: corpo }));
const del = (path: string) => app.request(path, comCookie(admin, { method: "DELETE" }));

const novoProjeto = (sigla: string) => ({
  sigla,
  nome: `Projeto ${sigla}`,
  inicio: "2026-01-01",
  fim: "2027-12-31",
});

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  projetoA = (
    await json<{ id: string }>(await post("/projetos", novoProjeto(`${PREFIXO_TESTE}AA-${sufixo}`)))
  ).data.id;
  projetoB = (
    await json<{ id: string }>(await post("/projetos", novoProjeto(`${PREFIXO_TESTE}AB-${sufixo}`)))
  ).data.id;

  [{ id: associacaoId }, { id: outraAssociacao }] = await db
    .insert(associacao)
    .values([
      { sigla: SIGLA, municipioId: 1100205 },
      { sigla: `${PREFIXO_TESTE}OUTRA-${sufixo}`, municipioId: 1100205 },
    ])
    .returning({ id: associacao.id });
  for (const [projetoId, assoc] of [
    [projetoA, associacaoId],
    [projetoA, outraAssociacao],
    [projetoB, associacaoId],
  ]) {
    await post(`/projetos/${projetoId}/associacoes`, { associacaoId: assoc });
  }

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
  [{ id: propriedadeId }] = await db
    .insert(propriedade)
    .values({ produtorId, associacaoId, nome: "Sítio Esperança", municipioId: 1100205 })
    .returning({ id: propriedade.id });

  [{ id: calcario }] = await db
    .insert(item)
    .values({ descricao: `${PREFIXO_TESTE}Calcário ${sufixo}`, tipo: "custeio", categoria: "insumo" })
    .returning({ id: item.id });

  const base = { projetoId: projetoA, associacaoId, itemId: calcario };
  [{ id: entregue }, { id: demandado }, { id: deOutraAssociacao }, { id: deOutroProjeto }] = await db
    .insert(entrega)
    .values([
      {
        ...base,
        quantidade: 10,
        lote: "1ª Entrega de 2026",
        situacao: "entregue",
        dataEntrega: "2026-05-02",
      },
      { ...base, situacao: "demandado" },
      { ...base, associacaoId: outraAssociacao, situacao: "entregue", dataEntrega: "2026-05-02" },
      { ...base, projetoId: projetoB, situacao: "entregue", dataEntrega: "2026-05-02" },
    ])
    .returning({ id: entrega.id });
});

describe("alvo do acompanhamento", () => {
  it("acompanhamento na associação → 201 com a associação e sem propriedade", async () => {
    const res = await post("/visitas", {
      projetoId: projetoA,
      tipo: "acompanhamento",
      associacaoId,
      data: "2026-06-10",
      tecnicoId: adminId,
    });
    expect(res.status).toBe(201);
    const v = (await json<Visita>(res)).data;
    expect(v).toMatchObject({
      tipo: "acompanhamento",
      associacaoId,
      associacaoSigla: SIGLA,
      propriedadeId: null,
    });
    acompanhamento = v.id;
  });

  it("acompanhamento na propriedade continua valendo → 201", async () => {
    const res = await post("/visitas", {
      projetoId: projetoA,
      tipo: "acompanhamento",
      propriedadeId,
      data: "2026-06-11",
      tecnicoId: adminId,
    });
    expect(res.status).toBe(201);
    acompanhamentoPropriedade = (await json<Visita>(res)).data.id;
  });

  it("acompanhamento sem alvo ou com os dois → 400", async () => {
    const semAlvo = await post("/visitas", {
      projetoId: projetoA,
      tipo: "acompanhamento",
      data: "2026-06-10",
      tecnicoId: adminId,
    });
    expect(semAlvo.status).toBe(400);
    const comOsDois = await post("/visitas", {
      projetoId: projetoA,
      tipo: "acompanhamento",
      associacaoId,
      propriedadeId,
      data: "2026-06-10",
      tecnicoId: adminId,
    });
    expect(comOsDois.status).toBe(400);
    expect((await json(comOsDois)).erros).toContain(
      "propriedadeId: O acompanhamento é na associação ou na propriedade: informe uma das duas",
    );
  });

  it("acompanhamento na associação com visita anterior → 400", async () => {
    const res = await post("/visitas", {
      projetoId: projetoA,
      tipo: "acompanhamento",
      associacaoId,
      visitaAnteriorId: acompanhamentoPropriedade,
      data: "2026-06-10",
      tecnicoId: adminId,
    });
    expect(res.status).toBe(400);
    expect((await json(res)).erros).toContain(
      "visitaAnteriorId: A visita anterior só se aplica ao acompanhamento na propriedade",
    );
  });

  it("assistência técnica na associação segue proibida → 400", async () => {
    const res = await post("/visitas", {
      projetoId: projetoA,
      tipo: "assistencia_tecnica",
      associacaoId,
      data: "2026-06-10",
      tecnicoId: adminId,
    });
    expect(res.status).toBe(400);
  });
});

describe("itens verificados", () => {
  it("GET começa vazio; no acompanhamento da propriedade → 422", async () => {
    const vazio = await app.request(`/visitas/${acompanhamento}/itens-verificados`, comCookie(admin));
    expect(await json(vazio)).toEqual({ data: [], meta: {}, erros: [] });

    const res = await app.request(
      `/visitas/${acompanhamentoPropriedade}/itens-verificados`,
      comCookie(admin),
    );
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "TIPO_VISITA_INVALIDO" });
  });

  it("PUT de entrega não entregue, de outra associação ou de outro projeto → 422; inexistente → 404", async () => {
    for (const entregaId of [demandado, deOutraAssociacao, deOutroProjeto]) {
      const res = await put(`/visitas/${acompanhamento}/itens-verificados/${entregaId}`, {});
      expect(res.status).toBe(422);
      expect((await json(res)).meta).toEqual({ codigo: "ENTREGA_INVALIDA" });
    }
    const inexistente = await put(`/visitas/${acompanhamento}/itens-verificados/${randomUUID()}`, {});
    expect(inexistente.status).toBe(404);
  });

  it("PUT da entrega fornecida → 200 com os dados da entrega; repetir atualiza a observação", async () => {
    const res = await put(`/visitas/${acompanhamento}/itens-verificados/${entregue}`, {
      observacao: "  Calcário aplicado na área coletiva  ",
    });
    expect(res.status).toBe(200);
    const corpo = await json<ItemVerificado>(res);
    verificacaoId = corpo.data.id;
    expect(corpo.data).toEqual({
      id: expect.any(String),
      visitaId: acompanhamento,
      entregaId: entregue,
      itemDescricao: `${PREFIXO_TESTE}Calcário ${sufixo}`,
      itemCategoria: "insumo",
      quantidade: 10,
      lote: "1ª Entrega de 2026",
      dataEntrega: "2026-05-02",
      observacao: "Calcário aplicado na área coletiva",
      fotos: 0,
    });

    const deNovo = await put(`/visitas/${acompanhamento}/itens-verificados/${entregue}`, { observacao: "" });
    expect((await json<ItemVerificado>(deNovo)).data.observacao).toBeNull();
    const lista = await json<ItemVerificado[]>(
      await app.request(`/visitas/${acompanhamento}/itens-verificados`, comCookie(admin)),
    );
    expect(lista.data).toHaveLength(1);
  });

  it("foto de item não verificado nesta visita → 422 antes de tocar o storage", async () => {
    const form = new FormData();
    form.append("arquivo", new File(["%PDF-1.4"], "nota.pdf", { type: "application/pdf" }));
    form.append("entregaId", deOutraAssociacao);
    const res = await app.request(`/visitas/${acompanhamento}/anexos`, {
      method: "POST",
      body: form,
      headers: { Cookie: admin, Origin: ORIGIN },
    });
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "ITEM_NAO_VERIFICADO" });
  });

  it("com foto do item: aparece no GET de itens e de anexos; desfazer → 409", async () => {
    await db.insert(visitaAnexo).values({
      visitaId: acompanhamento,
      entregaId: entregue,
      tipo: "foto",
      arquivoKey: `visitas/${acompanhamento}/foto.jpg`,
      nomeArquivo: "foto.jpg",
      mimeType: "image/jpeg",
      tamanhoBytes: 10,
    });
    const lista = await json<ItemVerificado[]>(
      await app.request(`/visitas/${acompanhamento}/itens-verificados`, comCookie(admin)),
    );
    expect(lista.data[0].fotos).toBe(1);
    const anexos = await json<{ entregaId: string | null }[]>(
      await app.request(`/visitas/${acompanhamento}/anexos`, comCookie(admin)),
    );
    expect(anexos.data.map((a) => a.entregaId)).toEqual([entregue]);

    const res = await del(`/visitas/${acompanhamento}/itens-verificados/${entregue}`);
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "ITEM_COM_FOTOS" });
  });

  it("entrega conferida não pode ser excluída → 409; visita com item verificado também → 409", async () => {
    const entregaRes = await del(`/entregas/${entregue}`);
    expect(entregaRes.status).toBe(409);
    expect((await json(entregaRes)).meta).toEqual({ codigo: "ENTREGA_VERIFICADA" });

    const visitaRes = await del(`/visitas/${acompanhamento}`);
    expect(visitaRes.status).toBe(409);
    expect((await json(visitaRes)).meta).toEqual({ codigo: "VISITA_EM_USO" });
  });

  it("sem fotos, desfazer → 204; de novo → 404", async () => {
    const [{ id: anexoId }] = await db
      .select({ id: visitaAnexo.id })
      .from(visitaAnexo)
      .where(eq(visitaAnexo.visitaId, acompanhamento));
    expect((await del(`/visitas/${acompanhamento}/anexos/${anexoId}`)).status).toBe(204);

    expect((await del(`/visitas/${acompanhamento}/itens-verificados/${entregue}`)).status).toBe(204);
    expect((await del(`/visitas/${acompanhamento}/itens-verificados/${entregue}`)).status).toBe(404);
    const lista = await app.request(`/visitas/${acompanhamento}/itens-verificados`, comCookie(admin));
    expect((await json(lista)).data).toEqual([]);
  });

  it("trigger registrou criação, alteração e exclusão da verificação com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(
          eq(historicoAlteracao.tabela, "visita_itens_verificados"),
          eq(historicoAlteracao.registroId, verificacaoId),
        ),
      )
      .orderBy(asc(historicoAlteracao.id));
    const operacoes = linhas.map((l) => l.operacao);
    expect(operacoes).toEqual(expect.arrayContaining(["INSERT", "UPDATE", "DELETE"]));
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
