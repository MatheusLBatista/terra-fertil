import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { analiseSolo } from "../../db/analiseSolo.ts";
import { associacao } from "../../db/associacao.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { user } from "../../db/user.ts";
import { visita } from "../../db/visita.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";
import { hoje } from "./analisesSolo.service.ts";

/**
 * Análises de solo pela API: necessidade → link do laudo (situação derivada),
 * adesão ATIVA da associação da propriedade ao projeto (422), visita da mesma
 * propriedade/projeto (422) e o ESCOPO (técnico só vê o projeto da equipe dele).
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Analise = {
  id: string;
  projetoId: string;
  propriedadeId: string;
  propriedadeNome: string | null;
  produtorNome: string;
  associacaoSigla: string;
  visitaId: string | null;
  identificadaEm: string;
  observacao: string | null;
  laudoUrl: string | null;
  laudoRegistradoEm: string | null;
  situacao: "pendente" | "com_laudo";
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-solo-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const PRODUTOR_NOME = `${PREFIXO_TESTE}Joana Produtora ${sufixo}`;
const LAUDO = "https://drive.example.com/laudo-123.pdf";
const MUNICIPIO = 1100205;

let admin: string;
let adminId: string;
let tecnico: string;
let usuario: string;
let projetoA: string;
let projetoB: string;
let propriedadeA: string; // associação com adesão ativa ao A
let propriedadeA2: string; // outra propriedade da mesma associação
let propriedadeB: string; // associação só com adesão ao B
let visitaA: string; // visita no A, na propriedadeA
let visitaOutraPropriedade: string; // visita no A, na propriedadeA2
let analiseId: string;
let analiseComLaudo: string;
let analiseB: string;

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

const aderir = (projetoId: string, associacaoId: string) =>
  app.request(
    `/projetos/${projetoId}/associacoes`,
    comCookie(admin, { method: "POST", json: { associacaoId } }),
  );

const nova = (corpo: Record<string, unknown>) =>
  app.request("/analises-solo", comCookie(admin, { method: "POST", json: corpo }));

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  usuario = await login("usuario@example.com");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  const criado = await auth.api.createUser({
    body: { email: EMAIL_TECNICO, password: SENHA_TECNICO, name: "Técnico Solo", role: "tecnico" as "admin" },
  });
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}SA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}SB-${sufixo}`);
  await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: criado.user.id, tipo: "tecnico" } }),
  );

  const [assocA, assocB] = await db
    .insert(associacao)
    .values([
      { sigla: `${PREFIXO_TESTE}ASSOC-A`, municipioId: MUNICIPIO },
      { sigla: `${PREFIXO_TESTE}ASSOC-B`, municipioId: MUNICIPIO },
    ])
    .returning({ id: associacao.id });
  await aderir(projetoA, assocA.id);
  await aderir(projetoB, assocB.id);

  const userProdutor = randomUUID();
  await db.insert(user).values({
    id: userProdutor,
    name: PRODUTOR_NOME,
    email: `${PREFIXO_TESTE}produtor-${sufixo}@example.com`,
  });
  const [{ id: produtorId }] = await db
    .insert(produtor)
    .values({ userId: userProdutor })
    .returning({ id: produtor.id });

  [{ id: propriedadeA }, { id: propriedadeA2 }, { id: propriedadeB }] = await db
    .insert(propriedade)
    .values([
      { produtorId, associacaoId: assocA.id, municipioId: MUNICIPIO, nome: "Sítio Boa Vista" },
      { produtorId, associacaoId: assocA.id, municipioId: MUNICIPIO, nome: "Chácara Recanto" },
      { produtorId, associacaoId: assocB.id, municipioId: MUNICIPIO, nome: "Fazenda Outra" },
    ])
    .returning({ id: propriedade.id });

  [{ id: visitaA }, { id: visitaOutraPropriedade }] = await db
    .insert(visita)
    .values([
      {
        projetoId: projetoA,
        tipo: "diagnostico_propriedade",
        propriedadeId: propriedadeA,
        data: "2026-03-01",
        tecnicoId: adminId,
      },
      {
        projetoId: projetoA,
        tipo: "assistencia_tecnica",
        propriedadeId: propriedadeA2,
        data: "2026-03-02",
        tecnicoId: adminId,
      },
    ])
    .returning({ id: visita.id });
});

describe("gates", () => {
  it("GET /analises-solo sem cookie → 401", async () => {
    const res = await app.request("/analises-solo", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST com usuario@example.com (só leitura) → 403", async () => {
    const res = await app.request(
      "/analises-solo",
      comCookie(usuario, {
        method: "POST",
        json: { projetoId: projetoA, propriedadeId: propriedadeA, identificadaEm: "2026-03-01" },
      }),
    );
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Acesso negado: permissão insuficiente"] });
  });
});

describe("criação", () => {
  it("POST cria a necessidade pendente, com nomes da propriedade/produtor/associação (201)", async () => {
    const res = await nova({
      projetoId: projetoA,
      propriedadeId: propriedadeA,
      visitaId: visitaA,
      identificadaEm: "2026-03-01",
      observacao: "Talhão do café",
    });
    expect(res.status).toBe(201);
    const corpo = await json<Analise>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        propriedadeId: propriedadeA,
        propriedadeNome: "Sítio Boa Vista",
        produtorNome: PRODUTOR_NOME,
        associacaoId: expect.any(String),
        associacaoSigla: `${PREFIXO_TESTE}ASSOC-A`,
        visitaId: visitaA,
        identificadaEm: "2026-03-01",
        observacao: "Talhão do café",
        laudoUrl: null,
        laudoRegistradoEm: null,
        situacao: "pendente",
      },
      meta: {},
      erros: [],
    });
    analiseId = corpo.data.id;
  });

  it("POST com laudoUrl e sem data → data do laudo = hoje, situação com_laudo", async () => {
    const res = await nova({
      projetoId: projetoA,
      propriedadeId: propriedadeA2,
      identificadaEm: "2026-02-10",
      laudoUrl: LAUDO,
    });
    expect(res.status).toBe(201);
    const data = (await json<Analise>(res)).data;
    expect(data).toMatchObject({ laudoUrl: LAUDO, laudoRegistradoEm: hoje(), situacao: "com_laudo" });
    analiseComLaudo = data.id;
  });

  it("POST com link não http(s) ou data do laudo sem link → 400 com o campo marcado", async () => {
    const ftp = await nova({
      projetoId: projetoA,
      propriedadeId: propriedadeA,
      identificadaEm: "2026-03-01",
      laudoUrl: "ftp://laudos.example.com/x.pdf",
    });
    expect(ftp.status).toBe(400);
    expect((await json(ftp)).meta.campos).toHaveProperty("laudoUrl");

    const semLink = await nova({
      projetoId: projetoA,
      propriedadeId: propriedadeA,
      identificadaEm: "2026-03-01",
      laudoRegistradoEm: "2026-03-05",
    });
    expect(semLink.status).toBe(400);
    expect((await json(semLink)).meta).toEqual({
      campos: { laudoRegistradoEm: "A data do laudo só pode ser informada junto com o link" },
    });
  });

  it("propriedade cuja associação não tem adesão ativa ao projeto → 422", async () => {
    const res = await nova({
      projetoId: projetoA,
      propriedadeId: propriedadeB,
      identificadaEm: "2026-03-01",
    });
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "SEM_ADESAO_ATIVA" },
      erros: ["A associação desta propriedade não tem adesão ativa ao projeto"],
    });
  });

  it("visita de outra propriedade → 422", async () => {
    const res = await nova({
      projetoId: projetoA,
      propriedadeId: propriedadeA,
      visitaId: visitaOutraPropriedade,
      identificadaEm: "2026-03-01",
    });
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "VISITA_INCOMPATIVEL" });
  });

  it("propriedade inexistente → 404", async () => {
    const res = await nova({
      projetoId: projetoA,
      propriedadeId: randomUUID(),
      identificadaEm: "2026-03-01",
    });
    expect(res.status).toBe(404);
    expect((await json(res)).erros).toEqual(["Propriedade não encontrada"]);
  });

  it("análise no projeto B (para o escopo)", async () => {
    const res = await nova({
      projetoId: projetoB,
      propriedadeId: propriedadeB,
      identificadaEm: "2026-01-15",
    });
    expect(res.status).toBe(201);
    analiseB = (await json<Analise>(res)).data.id;
  });
});

describe("laudo e alteração", () => {
  it("PUT /:id/laudo registra o link (data padrão hoje) e a situação vira com_laudo", async () => {
    const res = await app.request(
      `/analises-solo/${analiseId}/laudo`,
      comCookie(admin, { method: "PUT", json: { laudoUrl: LAUDO } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Analise>(res)).data).toMatchObject({
      laudoUrl: LAUDO,
      laudoRegistradoEm: hoje(),
      situacao: "com_laudo",
      observacao: "Talhão do café",
    });
  });

  it("PUT com data explícita grava a data informada", async () => {
    const res = await app.request(
      `/analises-solo/${analiseId}/laudo`,
      comCookie(admin, { method: "PUT", json: { laudoUrl: LAUDO, laudoRegistradoEm: "2026-04-02" } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Analise>(res)).data.laudoRegistradoEm).toBe("2026-04-02");
  });

  it("PUT com laudoUrl null remove link e data (volta a pendente); null + data → 400", async () => {
    const res = await app.request(
      `/analises-solo/${analiseId}/laudo`,
      comCookie(admin, { method: "PUT", json: { laudoUrl: null } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Analise>(res)).data).toMatchObject({
      laudoUrl: null,
      laudoRegistradoEm: null,
      situacao: "pendente",
    });

    const invalido = await app.request(
      `/analises-solo/${analiseId}/laudo`,
      comCookie(admin, { method: "PUT", json: { laudoUrl: null, laudoRegistradoEm: "2026-04-02" } }),
    );
    expect(invalido.status).toBe(400);

    const semCampo = await app.request(
      `/analises-solo/${analiseId}/laudo`,
      comCookie(admin, { method: "PUT", json: {} }),
    );
    expect(semCampo.status).toBe(400);
  });

  it("PATCH altera e preserva o resto; data do laudo sem link → 400", async () => {
    const res = await app.request(
      `/analises-solo/${analiseId}`,
      comCookie(admin, { method: "PATCH", json: { observacao: "Talhão do milho" } }),
    );
    expect(res.status).toBe(200);
    expect((await json<Analise>(res)).data).toMatchObject({
      observacao: "Talhão do milho",
      visitaId: visitaA,
      identificadaEm: "2026-03-01",
    });

    const semLink = await app.request(
      `/analises-solo/${analiseId}`,
      comCookie(admin, { method: "PATCH", json: { laudoRegistradoEm: "2026-04-02" } }),
    );
    expect(semLink.status).toBe(400);
    expect((await json(semLink)).erros).toEqual(["A data do laudo só pode ser informada junto com o link"]);
  });

  it("PATCH trocando a propriedade sem trocar a visita → 422 (a visita é da propriedade antiga)", async () => {
    const res = await app.request(
      `/analises-solo/${analiseId}`,
      comCookie(admin, { method: "PATCH", json: { propriedadeId: propriedadeA2 } }),
    );
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "VISITA_INCOMPATIVEL" });
  });
});

describe("listagem", () => {
  it("filtra pela situação derivada", async () => {
    const pendentes = await json<Analise[]>(
      await app.request(`/analises-solo?projetoId=${projetoA}&situacao=pendente`, comCookie(admin)),
    );
    expect(pendentes.data.map((a) => a.id)).toEqual([analiseId]);

    const comLaudo = await json<Analise[]>(
      await app.request(`/analises-solo?projetoId=${projetoA}&situacao=com_laudo`, comCookie(admin)),
    );
    expect(comLaudo.data.map((a) => a.id)).toEqual([analiseComLaudo]);
    expect(comLaudo.meta).toEqual({ total: 1, limit: 10, offset: 0 });
  });

  it("busca pelo nome da propriedade e intervalo de/ate sobre identificadaEm", async () => {
    const busca = await json<Analise[]>(await app.request("/analises-solo?busca=recanto", comCookie(admin)));
    expect(busca.data.map((a) => a.id)).toEqual([analiseComLaudo]);

    const periodo = await json<Analise[]>(
      await app.request("/analises-solo?de=2026-02-01&ate=2026-02-28", comCookie(admin)),
    );
    expect(periodo.data.map((a) => a.id)).toEqual([analiseComLaudo]);
  });

  it("padrão identificadaEm desc; sort asc inverte; campo fora da allowlist → 400", async () => {
    const padrao = await json<Analise[]>(
      await app.request(`/analises-solo?projetoId=${projetoA}`, comCookie(admin)),
    );
    expect(padrao.data.map((a) => a.id)).toEqual([analiseId, analiseComLaudo]);

    const asc_ = await json<Analise[]>(
      await app.request(`/analises-solo?projetoId=${projetoA}&sort=identificadaEm:asc`, comCookie(admin)),
    );
    expect(asc_.data.map((a) => a.id)).toEqual([analiseComLaudo, analiseId]);

    const invalido = await app.request("/analises-solo?sort=laudoUrl:asc", comCookie(admin));
    expect(invalido.status).toBe(400);
    expect((await json(invalido)).erros[0]).toContain("Campo de ordenação inválido");
  });
});

describe("escopo por projeto", () => {
  it("técnico da equipe do A só vê as análises do A", async () => {
    const res = await app.request("/analises-solo", comCookie(tecnico));
    expect(res.status).toBe(200);
    const ids = (await json<Analise[]>(res)).data.map((a) => a.id);
    expect(ids.sort()).toEqual([analiseId, analiseComLaudo].sort());
  });

  it("análise do B, ?projetoId=B e escrita no B → 404 para o técnico", async () => {
    const porId = await app.request(`/analises-solo/${analiseB}`, comCookie(tecnico));
    expect(porId.status).toBe(404);
    expect(await json(porId)).toEqual({ data: [], meta: {}, erros: ["Análise de solo não encontrada"] });

    expect((await app.request(`/analises-solo?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/analises-solo/${analiseId}`, comCookie(tecnico))).status).toBe(200);
  });
});

describe("exclusão", () => {
  it("DELETE 204 → GET 404 → DELETE de novo 404; a linha fica com deletedAt", async () => {
    const res = await app.request(`/analises-solo/${analiseId}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect((await app.request(`/analises-solo/${analiseId}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/analises-solo/${analiseId}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(404);

    const [linha] = await db
      .select({ deletedAt: analiseSolo.deletedAt })
      .from(analiseSolo)
      .where(eq(analiseSolo.id, analiseId));
    expect(linha.deletedAt).toEqual(expect.any(Date));
  });

  it("trigger registrou INSERT, UPDATEs e DELETE com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(eq(historicoAlteracao.tabela, "analises_solo"), eq(historicoAlteracao.registroId, analiseId)),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas[0].operacao).toBe("INSERT");
    expect(linhas.at(-1)?.operacao).toBe("DELETE");
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
