import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { associacaoDocumento } from "../../db/associacaoDocumento.ts";
import { tipoDocumento } from "../../db/tipoDocumento.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Tipos de documento: catálogo global (sem projeto/escopo). Gestor administra,
 * usuário só lê. Os `it` são encadeados (leem os ids criados antes).
 */
type TipoDocumento = {
  id: string;
  nome: string;
  obrigatorio: boolean;
  porProjeto: boolean;
  ordem: number;
  ativo: boolean;
};

const ESTATUTO = `${PREFIXO_TESTE}Estatuto social`;
const TERMO = `${PREFIXO_TESTE}Termo de parceria`;
const ATA = `${PREFIXO_TESTE}Ata de eleição`;

let gestor: string;
let usuario: string;
let gestorId: string;
let estatutoId: string;
let termoId: string;
let ataId: string;

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
  app.request("/tipos-documento", comCookie(cookie, { method: "POST", json: corpo }));

describe("gates", () => {
  it("GET sem cookie → 401", async () => {
    const res = await app.request("/tipos-documento", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST com usuario@example.com (só lê) → 403; GET → 200", async () => {
    const negado = await criar(usuario, { nome: ESTATUTO });
    expect(negado.status).toBe(403);
    expect(await json(negado)).toEqual({
      data: [],
      meta: {},
      erros: ["Acesso negado: permissão insuficiente"],
    });

    expect((await app.request("/tipos-documento", comCookie(usuario))).status).toBe(200);
  });
});

describe("CRUD", () => {
  it("POST cria com os padrões (201)", async () => {
    const res = await criar(gestor, { nome: ESTATUTO });
    expect(res.status).toBe(201);
    const corpo = await json<TipoDocumento>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        nome: ESTATUTO,
        obrigatorio: true,
        porProjeto: false,
        ordem: 0,
        ativo: true,
      },
      meta: {},
      erros: [],
    });
    estatutoId = corpo.data.id;

    termoId = (await json<TipoDocumento>(await criar(gestor, { nome: TERMO, porProjeto: true, ordem: 1 })))
      .data.id;
    ataId = (await json<TipoDocumento>(await criar(gestor, { nome: ATA, ordem: 2, ativo: false }))).data.id;
  });

  it("POST sem nome → 400 com o campo marcado", async () => {
    const res = await criar(gestor, { nome: "   " });
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { nome: "Informe o nome" } });
  });

  it("POST com o mesmo nome em outra caixa → 409", async () => {
    const res = await criar(gestor, { nome: ESTATUTO.toUpperCase() });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "TIPO_DOCUMENTO_DUPLICADO" },
      erros: [`Já existe um tipo de documento "${ESTATUTO.toUpperCase()}"`],
    });
  });

  it("GET lista na ordem do checklist; filtros e sort", async () => {
    const lista = await json<TipoDocumento[]>(await app.request("/tipos-documento", comCookie(usuario)));
    expect(lista.meta).toEqual({ total: 3, limit: 10, offset: 0 });
    expect(lista.data.map((t) => t.id)).toEqual([estatutoId, termoId, ataId]);

    const inativos = await json<TipoDocumento[]>(
      await app.request("/tipos-documento?ativo=false", comCookie(gestor)),
    );
    expect(inativos.data.map((t) => t.id)).toEqual([ataId]);

    const busca = await json<TipoDocumento[]>(
      await app.request("/tipos-documento?busca=PARCERIA", comCookie(gestor)),
    );
    expect(busca.data.map((t) => t.id)).toEqual([termoId]);

    const desc = await json<TipoDocumento[]>(
      await app.request("/tipos-documento?sort=ordem:desc", comCookie(gestor)),
    );
    expect(desc.data.map((t) => t.id)).toEqual([ataId, termoId, estatutoId]);

    const invalido = await app.request("/tipos-documento?sort=ativo:asc", comCookie(gestor));
    expect(invalido.status).toBe(400);
  });

  it("PATCH altera e preserva o resto; nome de outro tipo → 409", async () => {
    const res = await app.request(
      `/tipos-documento/${estatutoId}`,
      comCookie(gestor, { method: "PATCH", json: { ordem: 5, obrigatorio: false } }),
    );
    expect(res.status).toBe(200);
    expect((await json<TipoDocumento>(res)).data).toEqual({
      id: estatutoId,
      nome: ESTATUTO,
      obrigatorio: false,
      porProjeto: false,
      ordem: 5,
      ativo: true,
    });

    const dup = await app.request(
      `/tipos-documento/${estatutoId}`,
      comCookie(gestor, { method: "PATCH", json: { nome: TERMO.toLowerCase() } }),
    );
    expect(dup.status).toBe(409);
    expect((await json(dup)).meta).toEqual({ codigo: "TIPO_DOCUMENTO_DUPLICADO" });
  });
});

describe("exclusão", () => {
  it("tipo com documento entregue: DELETE → 409 e porProjeto não muda", async () => {
    const [{ id: associacaoId }] = await db
      .insert(associacao)
      .values({ sigla: `${PREFIXO_TESTE}ASSOC`, municipioId: 1100205 })
      .returning({ id: associacao.id });
    await db.insert(associacaoDocumento).values({ associacaoId, tipoDocumentoId: termoId });

    const res = await app.request(`/tipos-documento/${termoId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "TIPO_DOCUMENTO_EM_USO" },
      erros: [`"${TERMO}" já tem 1 documento(s) entregue(s) — desative-o em vez de excluir`],
    });

    const patch = await app.request(
      `/tipos-documento/${termoId}`,
      comCookie(gestor, { method: "PATCH", json: { porProjeto: false } }),
    );
    expect(patch.status).toBe(409);

    // Desativar continua permitido
    const desativa = await app.request(
      `/tipos-documento/${termoId}`,
      comCookie(gestor, { method: "PATCH", json: { ativo: false } }),
    );
    expect(desativa.status).toBe(200);
  });

  it("DELETE → 204; depois GET e DELETE → 404; a linha fica com deletedAt", async () => {
    const res = await app.request(`/tipos-documento/${estatutoId}`, comCookie(gestor, { method: "DELETE" }));
    expect(res.status).toBe(204);

    const get = await app.request(`/tipos-documento/${estatutoId}`, comCookie(gestor));
    expect(get.status).toBe(404);
    expect(await json(get)).toEqual({ data: [], meta: {}, erros: ["Tipo de documento não encontrado"] });
    expect(
      (await app.request(`/tipos-documento/${estatutoId}`, comCookie(gestor, { method: "DELETE" }))).status,
    ).toBe(404);

    const [linha] = await db
      .select({ deletedAt: tipoDocumento.deletedAt })
      .from(tipoDocumento)
      .where(eq(tipoDocumento.id, estatutoId));
    expect(linha.deletedAt).toEqual(expect.any(Date));
  });

  it("o nome do excluído fica livre (unique parcial) → 201", async () => {
    expect((await criar(gestor, { nome: ESTATUTO })).status).toBe(201);
  });

  it("trigger registrou INSERT, UPDATE e DELETE com o gestor", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(eq(historicoAlteracao.tabela, "tipos_documento"), eq(historicoAlteracao.registroId, estatutoId)),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === gestorId)).toBe(true);
  });
});
