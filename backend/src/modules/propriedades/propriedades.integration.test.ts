import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { analiseSolo } from "../../db/analiseSolo.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Propriedades pela API: validação de áreas/coordenadas/município, nomes
 * achatados (produtor, associação, município), exclusão bloqueada por análises
 * e — o ponto central — o ESCOPO pela associação que atende a propriedade.
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Propriedade = {
  id: string;
  produtorId: string;
  produtorNome: string;
  associacaoId: string;
  associacaoSigla: string;
  nome: string | null;
  municipioId: number;
  municipioNome: string;
  distrito: string | null;
  endereco: string | null;
  areaTotalHa: number | null;
  areaProdutivaHa: number | null;
  latitude: number | null;
  longitude: number | null;
  car: string | null;
  ativo: boolean;
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-prop-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const PORTO_VELHO = 1100205;
const JI_PARANA = 1100122;
const SIGLA_A = `${PREFIXO_TESTE}ASSOC-A`;
const SIGLA_B = `${PREFIXO_TESTE}ASSOC-B`;

let admin: string;
let adminId: string;
let tecnico: string;
let tecnicoId: string;
let projetoA: string;
let associacaoA: string; // aderiu ao projeto A (o do técnico)
let associacaoB: string; // aderiu só ao projeto B
let produtorA: string;
let produtorB: string;
let propriedadeA: string; // associação A
let propriedadeB: string; // associação B
let propriedadeExcluir: string;

const nome = (n: string) => `${PREFIXO_TESTE}${n}-${sufixo}`;

async function criarProjeto(sigla: string): Promise<string> {
  const res = await app.request(
    "/projetos",
    comCookie(admin, {
      method: "POST",
      json: { sigla, nome: `Projeto ${sigla}`, inicio: "2026-01-01", fim: "2027-12-31" },
    }),
  );
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).data.id;
}

async function criarAssociacao(sigla: string, projetoId: string): Promise<string> {
  const [{ id }] = await db
    .insert(associacao)
    .values({ sigla, municipioId: PORTO_VELHO })
    .returning({ id: associacao.id });
  const res = await app.request(
    `/projetos/${projetoId}/associacoes`,
    comCookie(admin, { method: "POST", json: { associacaoId: id } }),
  );
  expect(res.status).toBe(201);
  return id;
}

async function criarProdutor(n: string): Promise<string> {
  const res = await app.request(
    "/produtores",
    comCookie(admin, { method: "POST", json: { pessoa: { nome: nome(n) } } }),
  );
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).data.id;
}

const post = (cookie: string, corpo: Record<string, unknown>) =>
  app.request("/propriedades", comCookie(cookie, { method: "POST", json: corpo }));

const patch = (id: string, corpo: Record<string, unknown>) =>
  app.request(`/propriedades/${id}`, comCookie(admin, { method: "PATCH", json: corpo }));

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: SENHA_TECNICO,
      name: "Técnico Propriedades",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}PA-${sufixo}`);
  const projetoB = await criarProjeto(`${PREFIXO_TESTE}PB-${sufixo}`);
  const equipe = await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: criado.user.id, tipo: "tecnico" } }),
  );
  expect(equipe.status).toBe(201);

  associacaoA = await criarAssociacao(SIGLA_A, projetoA);
  associacaoB = await criarAssociacao(SIGLA_B, projetoB);
  produtorA = await criarProdutor("Ana");
  produtorB = await criarProdutor("Bruno");
});

describe("gates", () => {
  it("GET /propriedades sem cookie → 401", async () => {
    const res = await app.request("/propriedades", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /propriedades com usuario@example.com (só lê) → 403", async () => {
    const usuario = await login("usuario@example.com");
    const res = await post(usuario, { produtorId: produtorA, associacaoId: associacaoA });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({
      data: [],
      meta: {},
      erros: ["Acesso negado: permissão insuficiente"],
    });
  });
});

describe("cadastro", () => {
  it("POST mínimo → 201 com o município da associação e os nomes achatados", async () => {
    const res = await post(admin, {
      produtorId: produtorA,
      associacaoId: associacaoA,
      nome: nome("Sítio A"),
    });
    expect(res.status).toBe(201);
    const corpo = await json<Propriedade>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        produtorId: produtorA,
        produtorNome: nome("Ana"),
        associacaoId: associacaoA,
        associacaoSigla: SIGLA_A,
        nome: nome("Sítio A"),
        municipioId: PORTO_VELHO,
        municipioNome: "Porto Velho",
        distrito: null,
        endereco: null,
        areaTotalHa: null,
        areaProdutivaHa: null,
        latitude: null,
        longitude: null,
        car: null,
        ativo: true,
      },
      meta: {},
      erros: [],
    });
    propriedadeA = corpo.data.id;
  });

  it("POST completo em outra associação → 201 com áreas e coordenadas numéricas", async () => {
    const res = await post(admin, {
      produtorId: produtorB,
      associacaoId: associacaoB,
      nome: nome("Fazenda B"),
      municipioId: JI_PARANA,
      areaTotalHa: 12.5,
      areaProdutivaHa: 8,
      latitude: -10.876543,
      longitude: -61.951234,
      car: "RO-1100122-ABC",
    });
    expect(res.status).toBe(201);
    const data = (await json<Propriedade>(res)).data;
    expect(data).toMatchObject({
      municipioId: JI_PARANA,
      municipioNome: "Ji-Paraná",
      areaTotalHa: 12.5,
      areaProdutivaHa: 8,
      latitude: -10.876543,
      longitude: -61.951234,
      associacaoSigla: SIGLA_B,
    });
    propriedadeB = data.id;
  });

  it("área produtiva maior que a total → 400 no campo areaProdutivaHa", async () => {
    const res = await post(admin, {
      produtorId: produtorA,
      associacaoId: associacaoA,
      areaTotalHa: 5,
      areaProdutivaHa: 6,
    });
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({
      campos: { areaProdutivaHa: "A área produtiva não pode ser maior que a área total" },
    });
  });

  it("só latitude → 400; latitude fora da faixa → 400; área negativa → 400", async () => {
    const semLongitude = await post(admin, {
      produtorId: produtorA,
      associacaoId: associacaoA,
      latitude: -10,
    });
    expect(semLongitude.status).toBe(400);
    expect((await json(semLongitude)).meta).toEqual({
      campos: { latitude: "Informe latitude e longitude juntas (ou nenhuma)" },
    });

    const foraDaFaixa = await post(admin, {
      produtorId: produtorA,
      associacaoId: associacaoA,
      latitude: 91,
      longitude: 0,
    });
    expect(foraDaFaixa.status).toBe(400);
    expect((await json(foraDaFaixa)).meta).toEqual({ campos: { latitude: "Latitude entre -90 e 90" } });

    const negativa = await post(admin, { produtorId: produtorA, associacaoId: associacaoA, areaTotalHa: -1 });
    expect(negativa.status).toBe(400);
  });

  it("município inexistente → 404; produtor inexistente → 404", async () => {
    const mun = await post(admin, { produtorId: produtorA, associacaoId: associacaoA, municipioId: 9999999 });
    expect(mun.status).toBe(404);
    expect(await json(mun)).toEqual({ data: [], meta: {}, erros: ["Município não encontrado"] });

    const prod = await post(admin, { produtorId: randomUUID(), associacaoId: associacaoA });
    expect(prod.status).toBe(404);
    expect((await json(prod)).erros).toEqual(["Produtor não encontrado"]);
  });
});

describe("alteração", () => {
  it("PATCH altera e preserva o resto", async () => {
    const res = await patch(propriedadeA, { distrito: "Linha 10", municipioId: JI_PARANA, areaTotalHa: 3 });
    expect(res.status).toBe(200);
    expect((await json<Propriedade>(res)).data).toMatchObject({
      nome: nome("Sítio A"),
      distrito: "Linha 10",
      municipioId: JI_PARANA,
      municipioNome: "Ji-Paraná",
      areaTotalHa: 3,
    });
  });

  it("PATCH confere contra o registro atual: produtiva > total gravada → 400; só latitude → 400", async () => {
    const area = await patch(propriedadeA, { areaProdutivaHa: 4 });
    expect(area.status).toBe(400);
    expect((await json(area)).erros).toEqual([
      "areaProdutivaHa: A área produtiva não pode ser maior que a área total",
    ]);

    const coord = await patch(propriedadeA, { latitude: -9 });
    expect(coord.status).toBe(400);

    // Limpar as duas juntas é válido
    const limpa = await patch(propriedadeB, { latitude: null, longitude: null });
    expect(limpa.status).toBe(200);
    expect((await json<Propriedade>(limpa)).data).toMatchObject({ latitude: null, longitude: null });
  });
});

describe("listagem", () => {
  it("filtros por produtor, município e busca pelo nome do produtor; meta paginada", async () => {
    const porProdutor = await json<Propriedade[]>(
      await app.request(`/propriedades?produtorId=${produtorA}`, comCookie(admin)),
    );
    expect(porProdutor.data.map((p) => p.id)).toEqual([propriedadeA]);
    expect(porProdutor.meta).toEqual({ total: 1, limit: 10, offset: 0 });

    const porBusca = await json<Propriedade[]>(
      await app.request(`/propriedades?busca=${encodeURIComponent(nome("Bruno"))}`, comCookie(admin)),
    );
    expect(porBusca.data.map((p) => p.id)).toEqual([propriedadeB]);

    const porMunicipio = await json<Propriedade[]>(
      await app.request(`/propriedades?municipioId=${JI_PARANA}`, comCookie(admin)),
    );
    expect(porMunicipio.data.map((p) => p.id).sort()).toEqual([propriedadeA, propriedadeB].sort());
  });

  it("sort=produtorNome:desc respeita a ordem; campo fora da allowlist → 400", async () => {
    const desc = await json<Propriedade[]>(
      await app.request("/propriedades?sort=produtorNome:desc", comCookie(admin)),
    );
    const ids = desc.data.map((p) => p.id);
    expect(ids.indexOf(propriedadeB)).toBeLessThan(ids.indexOf(propriedadeA));

    const invalido = await app.request("/propriedades?sort=car:asc", comCookie(admin));
    expect(invalido.status).toBe(400);
    expect((await json(invalido)).erros[0]).toContain("Campo de ordenação inválido");
  });
});

describe("escopo", () => {
  it("técnico só vê as propriedades da associação do seu projeto; a outra → 404", async () => {
    const lista = await json<Propriedade[]>(await app.request("/propriedades", comCookie(tecnico)));
    expect(lista.data.map((p) => p.id)).toEqual([propriedadeA]);

    expect((await app.request(`/propriedades/${propriedadeA}`, comCookie(tecnico))).status).toBe(200);
    const b = await app.request(`/propriedades/${propriedadeB}`, comCookie(tecnico));
    expect(b.status).toBe(404);
    expect(await json(b)).toEqual({ data: [], meta: {}, erros: ["Propriedade não encontrada"] });

    expect((await app.request(`/propriedades?associacaoId=${associacaoB}`, comCookie(tecnico))).status).toBe(
      404,
    );
  });

  it("técnico não cria em associação de outro projeto nem para produtor que não enxerga", async () => {
    const assoc = await post(tecnico, { produtorId: produtorA, associacaoId: associacaoB });
    expect(assoc.status).toBe(404);
    expect((await json(assoc)).erros).toEqual(["Associação não encontrada"]);

    // Bruno só tem propriedade na associação B (fora do escopo do técnico)
    const prod = await post(tecnico, { produtorId: produtorB, associacaoId: associacaoA });
    expect(prod.status).toBe(404);
    expect((await json(prod)).erros).toEqual(["Produtor não encontrado"]);
  });

  it("técnico cadastra produtor e logo a propriedade dele na associação do seu projeto", async () => {
    const novo = await app.request(
      "/produtores",
      comCookie(tecnico, { method: "POST", json: { pessoa: { nome: nome("Carla") } } }),
    );
    expect(novo.status).toBe(201);
    const produtorC = (await json<{ id: string }>(novo)).data.id;

    const res = await post(tecnico, { produtorId: produtorC, associacaoId: associacaoA });
    expect(res.status).toBe(201);
    propriedadeExcluir = (await json<Propriedade>(res)).data.id;
  });
});

describe("exclusão", () => {
  it("DELETE de propriedade com análise de solo → 409 PROPRIEDADE_EM_USO", async () => {
    await db
      .insert(analiseSolo)
      .values({ projetoId: projetoA, propriedadeId: propriedadeA, identificadaEm: "2026-03-10" });
    const res = await app.request(`/propriedades/${propriedadeA}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PROPRIEDADE_EM_USO" });
  });

  it("DELETE 204 → GET 404 → DELETE de novo 404", async () => {
    const del = await app.request(
      `/propriedades/${propriedadeExcluir}`,
      comCookie(admin, { method: "DELETE" }),
    );
    expect(del.status).toBe(204);
    expect((await app.request(`/propriedades/${propriedadeExcluir}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/propriedades/${propriedadeExcluir}`, comCookie(admin, { method: "DELETE" })))
        .status,
    ).toBe(404);
  });

  it("trigger registrou o INSERT do técnico e o DELETE (soft) do admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(
          eq(historicoAlteracao.tabela, "propriedades"),
          eq(historicoAlteracao.registroId, propriedadeExcluir),
        ),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas).toEqual([
      { operacao: "INSERT", alteradoPor: tecnicoId },
      { operacao: "DELETE", alteradoPor: adminId },
    ]);
  });
});
