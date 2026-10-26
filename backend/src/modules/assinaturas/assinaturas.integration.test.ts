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
import { tipoDocumento } from "../../db/tipoDocumento.ts";
import { associacaoDocumento } from "../../db/associacaoDocumento.ts";
import { assinatura, type NewAssinatura } from "../../db/assinatura.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { ORIGIN, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Assinatura eletrônica simples nos três alvos (visita, termo de uso da
 * entrega, documento da associação): regras de cada dono (tipo de visita,
 * papel, nada verificado, entrega não entregue, documento sem arquivo), a
 * validação da imagem (PNG), uma viva por alvo (409), as travas depois de
 * assinado e a remoção. Os `it` são encadeados.
 * O POST com sucesso depende do Garage: a assinatura "colhida" é gravada direto no banco.
 */
type Assinatura = {
  id: string;
  nome: string;
  papel: string;
  assinadoEm: string;
  registradoPorNome: string | null;
};

const sufixo = randomUUID().slice(0, 8);
/** PNG 1×1 válido (o service confere a assinatura do arquivo, não só o tipo). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let admin: string;
let adminId: string;
let projetoId: string;
let associacaoId: string;
let entregue: string;
let demandado: string;
let acompanhamento: string;
let naPropriedade: string;
let documentoId: string;
let assinaturaVisita: string;

const post = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "POST", json: corpo }));
const put = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "PUT", json: corpo }));
const patch = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "PATCH", json: corpo }));
const del = (path: string) => app.request(path, comCookie(admin, { method: "DELETE" }));
const get = (path: string) => app.request(path, comCookie(admin));

/** POST multipart da assinatura. */
const assinar = (
  path: string,
  {
    nome = "Maria Presidente",
    papel = "presidente",
    imagem = new File([PNG], "assinatura.png", { type: "image/png" }),
  }: {
    nome?: string;
    papel?: string;
    imagem?: File;
  } = {},
) => {
  const form = new FormData();
  form.append("imagem", imagem);
  form.append("nome", nome);
  form.append("papel", papel);
  return app.request(`${path}/assinatura`, {
    method: "POST",
    body: form,
    headers: { Cookie: admin, Origin: ORIGIN },
  });
};

/** Assinatura "colhida" sem passar pelo storage. */
const gravarAssinatura = async (
  alvo: Pick<NewAssinatura, "visitaId" | "entregaId" | "associacaoDocumentoId">,
) => {
  const [{ id }] = await db
    .insert(assinatura)
    .values({ ...alvo, nome: "Maria Presidente", papel: "presidente", imagemKey: "teste/assinatura.png" })
    .returning({ id: assinatura.id });
  return id;
};

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  projetoId = (
    await json<{ id: string }>(
      await post("/projetos", {
        sigla: `${PREFIXO_TESTE}AS-${sufixo}`,
        nome: "Projeto assinaturas",
        inicio: "2026-01-01",
        fim: "2027-12-31",
      }),
    )
  ).data.id;
  [{ id: associacaoId }] = await db
    .insert(associacao)
    .values({ sigla: `${PREFIXO_TESTE}ASSIN-${sufixo}`, municipioId: 1100205 })
    .returning({ id: associacao.id });
  await post(`/projetos/${projetoId}/associacoes`, { associacaoId });

  const [{ id: produtorUserId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}Seu Antônio`,
      email: `${PREFIXO_TESTE}antonio-${sufixo}@example.com`,
      role: "produtor",
    })
    .returning({ id: user.id });
  const [{ id: produtorId }] = await db
    .insert(produtor)
    .values({ userId: produtorUserId })
    .returning({ id: produtor.id });
  const [{ id: propriedadeId }] = await db
    .insert(propriedade)
    .values({ produtorId, associacaoId, nome: "Sítio Assinado", municipioId: 1100205 })
    .returning({ id: propriedade.id });

  const [{ id: itemId }] = await db
    .insert(item)
    .values({ descricao: `${PREFIXO_TESTE}Calcário ${sufixo}`, tipo: "custeio", categoria: "insumo" })
    .returning({ id: item.id });
  [{ id: entregue }, { id: demandado }] = await db
    .insert(entrega)
    .values([
      { projetoId, associacaoId, itemId, situacao: "entregue", dataEntrega: "2026-05-02" },
      { projetoId, associacaoId, itemId, situacao: "demandado" },
    ])
    .returning({ id: entrega.id });

  const nova = async (corpo: Record<string, unknown>) =>
    (
      await json<{ id: string }>(
        await post("/visitas", { projetoId, tecnicoId: adminId, data: "2026-06-01", ...corpo }),
      )
    ).data.id;
  acompanhamento = await nova({ tipo: "acompanhamento", associacaoId });
  naPropriedade = await nova({ tipo: "acompanhamento", propriedadeId });

  const [{ id: tipoId }] = await db
    .insert(tipoDocumento)
    .values({ nome: `${PREFIXO_TESTE}Estatuto ${sufixo}` })
    .returning({ id: tipoDocumento.id });
  [{ id: documentoId }] = await db
    .insert(associacaoDocumento)
    .values({ associacaoId, tipoDocumentoId: tipoId })
    .returning({ id: associacaoDocumento.id });
});

describe("visita", () => {
  it("GET antes de assinar → data null; acompanhamento na propriedade não se assina → 422", async () => {
    const res = await get(`/visitas/${acompanhamento}/assinatura`);
    expect(await json(res)).toEqual({ data: null, meta: {}, erros: [] });

    const outra = await get(`/visitas/${naPropriedade}/assinatura`);
    expect(outra.status).toBe(422);
    expect((await json(outra)).meta).toEqual({ codigo: "TIPO_VISITA_INVALIDO" });
  });

  it("papel errado → 422; nada verificado → 422", async () => {
    const papel = await assinar(`/visitas/${acompanhamento}`, { papel: "proprietario" });
    expect(papel.status).toBe(422);
    expect((await json(papel)).meta).toEqual({ codigo: "PAPEL_INVALIDO" });

    const vazio = await assinar(`/visitas/${acompanhamento}`);
    expect(vazio.status).toBe(422);
    expect((await json(vazio)).meta).toEqual({ codigo: "SEM_VERIFICACAO" });
  });

  it("imagem que não é PNG → 415 (pelo tipo ou pelo conteúdo); sem nome → 400", async () => {
    expect((await put(`/visitas/${acompanhamento}/itens-verificados/${entregue}`, {})).status).toBe(200);

    const jpeg = await assinar(`/visitas/${acompanhamento}`, {
      imagem: new File([PNG], "a.jpg", { type: "image/jpeg" }),
    });
    expect(jpeg.status).toBe(415);
    const falso = await assinar(`/visitas/${acompanhamento}`, {
      imagem: new File(["nao sou png"], "a.png", { type: "image/png" }),
    });
    expect(falso.status).toBe(415);
    expect((await json(falso)).erros).toEqual(["A imagem da assinatura precisa ser PNG"]);

    const semNome = await assinar(`/visitas/${acompanhamento}`, { nome: "  " });
    expect(semNome.status).toBe(400);
  });

  it("assinada: GET devolve a assinatura; outra → 409; verificações travadas (409)", async () => {
    assinaturaVisita = await gravarAssinatura({ visitaId: acompanhamento });
    const res = await json<Assinatura>(await get(`/visitas/${acompanhamento}/assinatura`));
    expect(res.data).toEqual({
      id: expect.any(String),
      nome: "Maria Presidente",
      papel: "presidente",
      assinadoEm: expect.any(String),
      registradoPorNome: null,
    });

    const outra = await assinar(`/visitas/${acompanhamento}`);
    expect(outra.status).toBe(409);
    expect((await json(outra)).meta).toEqual({ codigo: "JA_ASSINADO" });

    for (const res of [
      await put(`/visitas/${acompanhamento}/itens-verificados/${entregue}`, { observacao: "x" }),
      await del(`/visitas/${acompanhamento}/itens-verificados/${entregue}`),
    ]) {
      expect(res.status).toBe(409);
      expect((await json(res)).meta).toEqual({ codigo: "VISITA_ASSINADA" });
    }
    expect((await del(`/visitas/${acompanhamento}`)).status).toBe(409);
  });

  it("DELETE remove (204) e destrava; de novo → 404", async () => {
    expect((await del(`/visitas/${acompanhamento}/assinatura`)).status).toBe(204);
    expect((await json(await get(`/visitas/${acompanhamento}/assinatura`))).data).toBeNull();
    expect((await del(`/visitas/${acompanhamento}/assinatura`)).status).toBe(404);
    expect((await put(`/visitas/${acompanhamento}/itens-verificados/${entregue}`, {})).status).toBe(200);
  });

  it("trigger registrou a remoção da assinatura com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(
          eq(historicoAlteracao.tabela, "assinaturas"),
          eq(historicoAlteracao.registroId, assinaturaVisita),
        ),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "DELETE"]);
    expect(linhas.at(-1)?.alteradoPor).toBe(adminId);
  });
});

describe("termo de uso da entrega", () => {
  it("entrega não entregue → 422; papel de proprietário → 422", async () => {
    const naoEntregue = await assinar(`/entregas/${demandado}`);
    expect(naoEntregue.status).toBe(422);
    expect((await json(naoEntregue)).meta).toEqual({ codigo: "ENTREGA_NAO_ENTREGUE" });

    const papel = await assinar(`/entregas/${entregue}`, { papel: "proprietario" });
    expect(papel.status).toBe(422);
    expect((await json(papel)).meta).toEqual({ codigo: "PAPEL_INVALIDO" });
  });

  it("assinado: temAssinatura na entrega; sair de entregue e excluir → 409; remover destrava", async () => {
    await gravarAssinatura({ entregaId: entregue });
    expect(
      (await json<{ temAssinatura: boolean }>(await get(`/entregas/${entregue}`))).data.temAssinatura,
    ).toBe(true);

    const situacao = await patch(`/entregas/${entregue}`, { situacao: "cancelado", dataEntrega: null });
    expect(situacao.status).toBe(409);
    expect((await json(situacao)).meta).toEqual({ codigo: "ENTREGA_ASSINADA" });
    expect((await del(`/entregas/${entregue}`)).status).toBe(409);

    expect((await del(`/entregas/${entregue}/assinatura`)).status).toBe(204);
    expect(
      (await json<{ temAssinatura: boolean }>(await get(`/entregas/${entregue}`))).data.temAssinatura,
    ).toBe(false);
  });
});

describe("documento da associação", () => {
  const base = () => `/associacoes/${associacaoId}/documentos/${documentoId}`;

  it("sem arquivo → 422; papel de proprietário → 422", async () => {
    const semArquivo = await assinar(base());
    expect(semArquivo.status).toBe(422);
    expect((await json(semArquivo)).meta).toEqual({ codigo: "DOCUMENTO_SEM_ARQUIVO" });

    await db
      .update(associacaoDocumento)
      .set({ arquivoKey: "teste/estatuto.pdf", nomeArquivo: "estatuto.pdf", mimeType: "application/pdf" })
      .where(eq(associacaoDocumento.id, documentoId));
    const papel = await assinar(base(), { papel: "proprietario" });
    expect(papel.status).toBe(422);
  });

  it("assinado: temAssinatura na lista; trocar o arquivo → 409; remover → 204", async () => {
    await gravarAssinatura({ associacaoDocumentoId: documentoId });
    const lista = await json<{ id: string; temAssinatura: boolean }[]>(
      await get(`/associacoes/${associacaoId}/documentos`),
    );
    expect(lista.data.find((d) => d.id === documentoId)?.temAssinatura).toBe(true);

    const form = new FormData();
    form.append("arquivo", new File(["%PDF-1.4"], "novo.pdf", { type: "application/pdf" }));
    const troca = await app.request(`${base()}/arquivo`, {
      method: "PUT",
      body: form,
      headers: { Cookie: admin, Origin: ORIGIN },
    });
    expect(troca.status).toBe(409);
    expect((await json(troca)).meta).toEqual({ codigo: "DOCUMENTO_ASSINADO" });

    expect((await del(`${base()}/assinatura`)).status).toBe(204);
  });
});
