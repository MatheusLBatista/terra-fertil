import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { tipoDocumento } from "../../db/tipoDocumento.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { diagnosticoOpcao } from "../../db/diagnosticoOpcao.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Associações pela API: CRUD com escopo (técnico só vê as que aderiram aos
 * projetos da equipe dele), contatos, documentos e o diagnóstico único.
 * Upload de arquivo fica de fora: o .env de dev aponta para um bucket real.
 */
type Associacao = { id: string; sigla: string; cnpj: string | null; municipioNome: string; uf: string };
type Contato = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  principal: boolean;
};
type Documento = { id: string; situacao: string; temArquivo: boolean; projetoId: string | null };
type Diagnostico = {
  revisado: boolean;
  acessoMaquinario: string | null;
  opcoes: { nome: string; detalhe: string | null }[];
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tec-assoc-${sufixo}@example.com`;
const SENHA = "senha-teste-123";
const PORTO_VELHO = 1100205;
const ARIQUEMES = 1100023;

let admin: string;
let tecnico: string;
let tecnicoId: string;
let projetoA: string;
let projetoB: string;
let associacaoA: string;
let associacaoB: string;
let tipoEstatuto: string;
let tipoPlano: string;
let opcaoCafe: string;
let opcaoOutro: string;

const post = async (cookie: string, url: string, corpo: unknown): Promise<Response> =>
  app.request(url, comCookie(cookie, { method: "POST", json: corpo }));

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  const criado = await auth.api.createUser({
    body: { email: EMAIL_TECNICO, password: SENHA, name: "Técnico Associações", role: "tecnico" as "admin" },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA);

  const projeto = (sigla: string) =>
    post(admin, "/projetos", { sigla, nome: sigla, inicio: "2026-01-01", fim: "2026-12-31" }).then(
      async (r) => (await json<{ id: string }>(r)).data.id,
    );
  projetoA = await projeto(`${PREFIXO_TESTE}PA-${sufixo}`);
  projetoB = await projeto(`${PREFIXO_TESTE}PB-${sufixo}`);
  await post(admin, `/projetos/${projetoA}/equipe`, { userId: tecnicoId, tipo: "tecnico" });

  [{ id: tipoEstatuto }, { id: tipoPlano }] = await db
    .insert(tipoDocumento)
    .values([
      { nome: `${PREFIXO_TESTE}Estatuto` },
      { nome: `${PREFIXO_TESTE}Plano de gestão`, porProjeto: true },
    ])
    .returning({ id: tipoDocumento.id });
  [{ id: opcaoCafe }, { id: opcaoOutro }] = await db
    .insert(opcaoDiagnostico)
    .values([
      { grupo: "atividade_produtiva", nome: "Café" },
      { grupo: "atividade_produtiva", nome: "Outro", permiteDetalhe: true },
    ])
    .returning({ id: opcaoDiagnostico.id });
});

describe("gates e validação", () => {
  it("sem cookie → 401; usuário só leitor criando → 403", async () => {
    expect((await app.request("/associacoes", anonima())).status).toBe(401);
    const usuario = await login("usuario@example.com");
    const res = await post(usuario, "/associacoes", { sigla: "X", municipioId: PORTO_VELHO });
    expect(res.status).toBe(403);
  });

  it("CNPJ com dígito errado → 400 com o campo marcado", async () => {
    const res = await post(admin, "/associacoes", {
      sigla: "ASPRO",
      municipioId: PORTO_VELHO,
      cnpj: "91.34307/0001-50",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({ campos: { cnpj: "CNPJ inválido" } });
  });

  it("técnico sem projeto → 400 (a associação sumiria do escopo dele)", async () => {
    const res = await post(tecnico, "/associacoes", { sigla: "ASPRO", municipioId: PORTO_VELHO });
    expect(res.status).toBe(400);
    expect((await json(res)).erros).toEqual(["Informe o projeto ao qual a associação vai aderir"]);
  });
});

describe("CRUD com escopo", () => {
  it("técnico cria no projeto da equipe dele (201) e a adesão nasce junto", async () => {
    const res = await post(tecnico, "/associacoes", {
      sigla: "ASPROMEP",
      nome: "Associação dos Produtores",
      municipioId: PORTO_VELHO,
      cnpj: "07.638.987/0001-13",
      projetoId: projetoA,
    });
    expect(res.status).toBe(201);
    const a = (await json<Associacao>(res)).data;
    expect(a).toMatchObject({
      sigla: "ASPROMEP",
      cnpj: "07638987000113",
      municipioNome: "Porto Velho",
      uf: "RO",
    });
    associacaoA = a.id;

    const adesoes = await json<{ associacaoId: string }[]>(
      await app.request(`/projetos/${projetoA}/associacoes`, comCookie(admin)),
    );
    expect(adesoes.data.map((x) => x.associacaoId)).toEqual([associacaoA]);
  });

  it("mesma sigla no mesmo município → 409; CNPJ repetido → 409", async () => {
    const sigla = await post(admin, "/associacoes", { sigla: "aspromep", municipioId: PORTO_VELHO });
    expect(sigla.status).toBe(409);
    expect((await json(sigla)).meta).toEqual({ codigo: "ASSOCIACAO_DUPLICADA" });

    const cnpj = await post(admin, "/associacoes", {
      sigla: "OUTRA",
      municipioId: ARIQUEMES,
      cnpj: "07638987000113",
    });
    expect(cnpj.status).toBe(409);
    expect(await json(cnpj)).toEqual({
      data: [],
      meta: { codigo: "CNPJ_DUPLICADO" },
      erros: ["CNPJ já cadastrado para ASPROMEP"],
    });
  });

  it("associação só do projeto B não aparece para o técnico (lista e 404)", async () => {
    const res = await post(admin, "/associacoes", {
      sigla: "CISAN",
      municipioId: ARIQUEMES,
      projetoId: projetoB,
    });
    associacaoB = (await json<Associacao>(res)).data.id;

    const lista = await json<Associacao[]>(await app.request("/associacoes", comCookie(tecnico)));
    expect(lista.data.map((a) => a.id)).toEqual([associacaoA]);
    expect(lista.meta).toEqual({ total: 1, limit: 10, offset: 0 });
    expect((await app.request(`/associacoes/${associacaoB}`, comCookie(tecnico))).status).toBe(404);

    // Admin vê as duas; o filtro por projeto restringe
    const doB = await json<Associacao[]>(
      await app.request(`/associacoes?projetoId=${projetoB}`, comCookie(admin)),
    );
    expect(doB.data.map((a) => a.id)).toEqual([associacaoB]);
  });

  it("PATCH preserva o resto; sort fora da allowlist → 400", async () => {
    const res = await app.request(
      `/associacoes/${associacaoA}`,
      comCookie(tecnico, { method: "PATCH", json: { numProdutores: 90, numFamilias: 120 } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Associacao & { numProdutores: number }>(res)).data).toMatchObject({
      sigla: "ASPROMEP",
      numProdutores: 90,
    });
    expect((await app.request("/associacoes?sort=cnpj:asc", comCookie(admin))).status).toBe(400);
  });
});

describe("contatos", () => {
  let primeiro: string;

  it("pessoa nova sem e-mail vira contato principal (e-mail técnico não sai)", async () => {
    const res = await post(tecnico, `/associacoes/${associacaoA}/contatos`, {
      pessoa: { nome: `${PREFIXO_TESTE}Arivelton`, telefone: "069993453103" },
      funcao: "presidente",
      principal: true,
    });
    expect(res.status).toBe(201);
    const c = (await json<Contato>(res)).data;
    expect(c).toMatchObject({ email: null, telefone: "5569993453103", principal: true });
    primeiro = c.id;
  });

  it("marcar outro como principal desmarca o anterior", async () => {
    const res = await post(tecnico, `/associacoes/${associacaoA}/contatos`, {
      pessoa: { nome: `${PREFIXO_TESTE}Flávio` },
      principal: true,
    });
    expect(res.status).toBe(201);
    const lista = await json<Contato[]>(
      await app.request(`/associacoes/${associacaoA}/contatos`, comCookie(tecnico)),
    );
    expect(lista.data.filter((c) => c.principal)).toHaveLength(1);
    expect(lista.data.find((c) => c.id === primeiro)?.principal).toBe(false);
  });

  it("mesmo telefone em pessoa nova → 409 PESSOA_DUPLICADA", async () => {
    const res = await post(tecnico, `/associacoes/${associacaoA}/contatos`, {
      pessoa: { nome: `${PREFIXO_TESTE}Outro`, telefone: "(69) 99345-3103" },
    });
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PESSOA_DUPLICADA" });
  });
});

describe("documentos", () => {
  let doc: string;

  it("documento da associação (201, pendente, sem arquivo); repetido → 409", async () => {
    const res = await post(tecnico, `/associacoes/${associacaoA}/documentos`, {
      tipoDocumentoId: tipoEstatuto,
    });
    expect(res.status).toBe(201);
    const d = (await json<Documento>(res)).data;
    expect(d).toMatchObject({ situacao: "pendente", temArquivo: false, projetoId: null });
    doc = d.id;

    const dup = await post(tecnico, `/associacoes/${associacaoA}/documentos`, {
      tipoDocumentoId: tipoEstatuto,
    });
    expect(dup.status).toBe(409);
  });

  it("tipo por projeto exige projeto (422) e a associação precisa participar dele (422)", async () => {
    const semProjeto = await post(admin, `/associacoes/${associacaoA}/documentos`, {
      tipoDocumentoId: tipoPlano,
    });
    expect(semProjeto.status).toBe(422);
    expect((await json(semProjeto)).meta).toEqual({ codigo: "DOCUMENTO_SEM_PROJETO" });

    const semAdesao = await post(admin, `/associacoes/${associacaoA}/documentos`, {
      tipoDocumentoId: tipoPlano,
      projetoId: projetoB,
    });
    expect(semAdesao.status).toBe(422);

    const ok = await post(admin, `/associacoes/${associacaoA}/documentos`, {
      tipoDocumentoId: tipoPlano,
      projetoId: projetoA,
    });
    expect(ok.status).toBe(201);
  });

  it("baixar arquivo de documento sem arquivo → 404; PATCH da situação → 200", async () => {
    const baixar = await app.request(
      `/associacoes/${associacaoA}/documentos/${doc}/arquivo`,
      comCookie(tecnico),
    );
    expect(baixar.status).toBe(404);

    const res = await app.request(
      `/associacoes/${associacaoA}/documentos/${doc}`,
      comCookie(tecnico, { method: "PATCH", json: { situacao: "recebido" } }),
    );
    expect((await json<Documento>(res)).data.situacao).toBe("recebido");
  });
});

describe("diagnóstico único", () => {
  it("GET antes de preencher → 404", async () => {
    expect((await app.request(`/associacoes/${associacaoA}/diagnostico`, comCookie(tecnico))).status).toBe(
      404,
    );
  });

  it("PUT cria com opções; detalhe só fica no 'Outro'", async () => {
    const res = await app.request(
      `/associacoes/${associacaoA}/diagnostico`,
      comCookie(tecnico, {
        method: "PUT",
        json: {
          coletadoEm: "2025-10-22",
          acessoMaquinario: "parcialmente",
          opcoes: [
            { opcaoId: opcaoCafe, detalhe: "ignorado" },
            { opcaoId: opcaoOutro, detalhe: "Mandioca" },
          ],
        },
      }),
    );
    expect(res.status).toBe(200);
    const d = (await json<Diagnostico>(res)).data;
    expect(d).toMatchObject({ acessoMaquinario: "parcialmente", revisado: false });
    expect(d.opcoes.map((o) => [o.nome, o.detalhe])).toEqual([
      ["Café", null],
      ["Outro", "Mandioca"],
    ]);
  });

  it("PUT de novo substitui as opções (e marca revisado)", async () => {
    const res = await app.request(
      `/associacoes/${associacaoA}/diagnostico`,
      comCookie(tecnico, {
        method: "PUT",
        json: { coletadoEm: "2025-10-22", revisado: true, opcoes: [{ opcaoId: opcaoCafe }] },
      }),
    );
    const d = (await json<Diagnostico>(res)).data;
    expect(d.revisado).toBe(true);
    expect(d.opcoes.map((o) => o.nome)).toEqual(["Café"]);
    const vivas = await db
      .select({ id: diagnosticoOpcao.id })
      .from(diagnosticoOpcao)
      .where(and(eq(diagnosticoOpcao.associacaoId, associacaoA), isNull(diagnosticoOpcao.deletedAt)));
    expect(vivas).toHaveLength(1);
  });

  it("opção inexistente → 422", async () => {
    const res = await app.request(
      `/associacoes/${associacaoA}/diagnostico`,
      comCookie(tecnico, {
        method: "PUT",
        json: { coletadoEm: "2025-10-22", opcoes: [{ opcaoId: randomUUID() }] },
      }),
    );
    expect(res.status).toBe(422);
  });
});

describe("exclusão", () => {
  it("associação que participa de projeto → 409; sem vínculos → 204 e depois 404", async () => {
    const emUso = await app.request(`/associacoes/${associacaoA}`, comCookie(admin, { method: "DELETE" }));
    expect(emUso.status).toBe(409);
    expect((await json(emUso)).meta).toEqual({ codigo: "ASSOCIACAO_EM_USO" });

    const livre = await post(admin, "/associacoes", { sigla: "LIVRE", municipioId: PORTO_VELHO });
    const id = (await json<Associacao>(livre)).data.id;
    expect((await app.request(`/associacoes/${id}`, comCookie(admin, { method: "DELETE" }))).status).toBe(
      204,
    );
    expect((await app.request(`/associacoes/${id}`, comCookie(admin))).status).toBe(404);
  });
});
