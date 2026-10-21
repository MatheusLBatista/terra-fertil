import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { propriedade } from "../../db/propriedade.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Produtores pela API: perfil 1:1 do usuário (pessoa nova ou existente), CPF,
 * unique total com reativar e — o ponto central — o ESCOPO: o técnico vê os
 * produtores com propriedade numa associação do seu projeto e os que ele mesmo
 * cadastrou. Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Produtor = {
  id: string;
  userId: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  observacao: string | null;
  ativo: boolean;
  totalPropriedades: number;
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tecnico-prod-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";
const MUNICIPIO = 1100205; // Porto Velho

// CPFs válidos (dígito verificador correto)
const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";

let admin: string;
let adminId: string;
let tecnico: string;
let associacaoA: string; // aderiu ao projeto A (o do técnico)
let associacaoB: string; // aderiu só ao projeto B

let produtorA: string; // admin cadastra; ganha propriedade na associação A
let produtorB: string; // admin cadastra; ganha propriedade na associação B
let produtorTecnico: string; // o técnico cadastra (sem propriedade)
let produtorExcluido: string;
let userIdA: string;

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
    .values({ sigla, municipioId: MUNICIPIO })
    .returning({ id: associacao.id });
  const res = await app.request(
    `/projetos/${projetoId}/associacoes`,
    comCookie(admin, { method: "POST", json: { associacaoId: id } }),
  );
  expect(res.status).toBe(201);
  return id;
}

const criarProdutor = (cookie: string, corpo: Record<string, unknown>) =>
  app.request("/produtores", comCookie(cookie, { method: "POST", json: corpo }));

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
      name: "Técnico Produtores",
      role: "tecnico" as "admin",
    },
  });
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  const projetoA = await criarProjeto(`${PREFIXO_TESTE}PA-${sufixo}`);
  const projetoB = await criarProjeto(`${PREFIXO_TESTE}PB-${sufixo}`);
  const equipe = await app.request(
    `/projetos/${projetoA}/equipe`,
    comCookie(admin, { method: "POST", json: { userId: criado.user.id, tipo: "tecnico" } }),
  );
  expect(equipe.status).toBe(201);

  associacaoA = await criarAssociacao(`${PREFIXO_TESTE}ASSOC-A`, projetoA);
  associacaoB = await criarAssociacao(`${PREFIXO_TESTE}ASSOC-B`, projetoB);
});

describe("gates", () => {
  it("GET /produtores sem cookie → 401", async () => {
    const res = await app.request("/produtores", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /produtores com usuario@example.com (só lê) → 403", async () => {
    const usuario = await login("usuario@example.com");
    const res = await criarProdutor(usuario, { pessoa: { nome: nome("negado") } });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({
      data: [],
      meta: {},
      erros: ["Acesso negado: permissão insuficiente"],
    });
  });
});

describe("cadastro", () => {
  it("POST com pessoa nova e CPF mascarado → 201 (CPF só dígitos, sem e-mail técnico)", async () => {
    const res = await criarProdutor(admin, {
      pessoa: { nome: nome("Produtor A"), telefone: "(69) 9 9888-0001" },
      cpf: CPF_A,
    });
    expect(res.status).toBe(201);
    const corpo = await json<Produtor>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        userId: expect.any(String),
        nome: nome("Produtor A"),
        email: null,
        telefone: "5569998880001",
        cpf: "52998224725",
        observacao: null,
        ativo: true,
        totalPropriedades: 0,
      },
      meta: {},
      erros: [],
    });
    produtorA = corpo.data.id;
    userIdA = corpo.data.userId;

    // A pessoa nova nasce com o papel produtor
    const [pessoa] = await db.select({ role: user.role }).from(user).where(eq(user.id, userIdA));
    expect(pessoa.role).toBe("produtor");
  });

  it("CPF inválido → 400 com o campo marcado", async () => {
    const res = await criarProdutor(admin, {
      pessoa: { nome: nome("cpf-invalido") },
      cpf: "111.111.111-11",
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      data: [],
      meta: { campos: { cpf: "CPF inválido" } },
      erros: ["cpf: CPF inválido"],
    });
  });

  it("sem userId nem pessoa → 400", async () => {
    const res = await criarProdutor(admin, { cpf: CPF_B });
    expect(res.status).toBe(400);
    expect((await json(res)).meta).toEqual({
      campos: { userId: "Informe userId (pessoa existente) ou pessoa (nova) — um dos dois" },
    });
  });

  it("mesmo usuário de novo → 409 PRODUTOR_DUPLICADO", async () => {
    const res = await criarProdutor(admin, { userId: userIdA });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "PRODUTOR_DUPLICADO" },
      erros: [`${nome("Produtor A")} já está cadastrado(a) como produtor`],
    });
  });

  it("CPF já usado → 409 CPF_DUPLICADO e a pessoa nova não fica gravada (transação)", async () => {
    const res = await criarProdutor(admin, {
      pessoa: { nome: nome("cpf-repetido") },
      cpf: "52998224725",
    });
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "CPF_DUPLICADO" });
    const sobrou = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, nome("cpf-repetido")));
    expect(sobrou).toEqual([]);
  });

  it("POST do produtor B (outro projeto)", async () => {
    const res = await criarProdutor(admin, { pessoa: { nome: nome("Produtor B") }, cpf: CPF_B });
    expect(res.status).toBe(201);
    produtorB = (await json<Produtor>(res)).data.id;
  });
});

describe("alteração", () => {
  it("PATCH altera produtor e pessoa e preserva o resto", async () => {
    const res = await app.request(
      `/produtores/${produtorA}`,
      comCookie(admin, {
        method: "PATCH",
        json: {
          observacao: "Cultiva café",
          telefone: "69 99888-0002",
          email: `${PREFIXO_TESTE}a-${sufixo}@ex.com`,
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await json<Produtor>(res)).data).toMatchObject({
      nome: nome("Produtor A"),
      cpf: "52998224725",
      observacao: "Cultiva café",
      telefone: "5569998880002",
      email: `${PREFIXO_TESTE}a-${sufixo}@ex.com`,
    });
  });

  it("PATCH com e-mail de outra pessoa → 409; com email null volta a não ter e-mail", async () => {
    const dup = await app.request(
      `/produtores/${produtorA}`,
      comCookie(admin, { method: "PATCH", json: { email: "fslab.vilhena@ifro.edu.br" } }),
    );
    expect(dup.status).toBe(409);
    expect((await json(dup)).meta).toEqual({ codigo: "PESSOA_DUPLICADA" });

    const sem = await app.request(
      `/produtores/${produtorA}`,
      comCookie(admin, { method: "PATCH", json: { email: null } }),
    );
    expect(sem.status).toBe(200);
    expect((await json<Produtor>(sem)).data.email).toBeNull();
  });

  it("PATCH com CPF inválido → 400; com CPF de outro produtor → 409", async () => {
    const invalido = await app.request(
      `/produtores/${produtorA}`,
      comCookie(admin, { method: "PATCH", json: { cpf: "123" } }),
    );
    expect(invalido.status).toBe(400);

    const dup = await app.request(
      `/produtores/${produtorA}`,
      comCookie(admin, { method: "PATCH", json: { cpf: CPF_B } }),
    );
    expect(dup.status).toBe(409);
    expect((await json(dup)).meta).toEqual({ codigo: "CPF_DUPLICADO" });
  });
});

describe("listagem", () => {
  it("busca por nome, CPF ou telefone e ordenação", async () => {
    const porCpf = await json<Produtor[]>(await app.request("/produtores?busca=529.982", comCookie(admin)));
    expect(porCpf.data.map((p) => p.id)).toEqual([produtorA]);
    expect(porCpf.meta).toEqual({ total: 1, limit: 10, offset: 0 });

    const desc = await json<Produtor[]>(
      await app.request(`/produtores?busca=${PREFIXO_TESTE}&sort=nome:desc`, comCookie(admin)),
    );
    const ids = desc.data.map((p) => p.id);
    expect(ids.indexOf(produtorB)).toBeLessThan(ids.indexOf(produtorA));

    const invalido = await app.request("/produtores?sort=cpf:asc", comCookie(admin));
    expect(invalido.status).toBe(400);
  });
});

describe("escopo", () => {
  it("técnico cadastra produtor e o enxerga antes de ter propriedade", async () => {
    const res = await criarProdutor(tecnico, { pessoa: { nome: nome("Produtor do Técnico") } });
    expect(res.status).toBe(201);
    produtorTecnico = (await json<Produtor>(res)).data.id;

    const lista = await json<Produtor[]>(await app.request("/produtores", comCookie(tecnico)));
    expect(lista.data.map((p) => p.id)).toEqual([produtorTecnico]);
  });

  it("produtor sem propriedade no projeto do técnico → 404 para ele", async () => {
    const res = await app.request(`/produtores/${produtorA}`, comCookie(tecnico));
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Produtor não encontrado"] });
  });

  it("com propriedade na associação do projeto A, o técnico passa a ver o produtor A (não o B)", async () => {
    await db.insert(propriedade).values([
      { produtorId: produtorA, associacaoId: associacaoA, municipioId: MUNICIPIO, nome: nome("Sítio A") },
      { produtorId: produtorB, associacaoId: associacaoB, municipioId: MUNICIPIO, nome: nome("Sítio B") },
    ]);

    const a = await app.request(`/produtores/${produtorA}`, comCookie(tecnico));
    expect(a.status).toBe(200);
    expect((await json<Produtor>(a)).data.totalPropriedades).toBe(1);

    expect((await app.request(`/produtores/${produtorB}`, comCookie(tecnico))).status).toBe(404);

    const lista = await json<Produtor[]>(await app.request("/produtores?sort=nome:asc", comCookie(tecnico)));
    expect(lista.data.map((p) => p.id).sort()).toEqual([produtorA, produtorTecnico].sort());

    const porAssociacao = await json<Produtor[]>(
      await app.request(`/produtores?associacaoId=${associacaoA}`, comCookie(tecnico)),
    );
    expect(porAssociacao.data.map((p) => p.id)).toEqual([produtorA]);

    // Filtrar por associação de outro projeto não revela nada
    expect((await app.request(`/produtores?associacaoId=${associacaoB}`, comCookie(tecnico))).status).toBe(
      404,
    );
  });
});

describe("exclusão e reativação", () => {
  it("DELETE de produtor com propriedade → 409 PRODUTOR_EM_USO", async () => {
    const res = await app.request(`/produtores/${produtorA}`, comCookie(admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "PRODUTOR_EM_USO" });
  });

  it("DELETE 204 → GET 404 → DELETE de novo 404", async () => {
    const criado = await criarProdutor(admin, { pessoa: { nome: nome("Produtor Excluído") } });
    produtorExcluido = (await json<Produtor>(criado)).data.id;

    const del = await app.request(`/produtores/${produtorExcluido}`, comCookie(admin, { method: "DELETE" }));
    expect(del.status).toBe(204);
    expect((await app.request(`/produtores/${produtorExcluido}`, comCookie(admin))).status).toBe(404);
    expect(
      (await app.request(`/produtores/${produtorExcluido}`, comCookie(admin, { method: "DELETE" }))).status,
    ).toBe(404);
  });

  it("recadastrar o mesmo usuário → 409 PRODUTOR_EXCLUIDO; reativar → 200; reativar de novo → 409", async () => {
    const [pessoa] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.name, nome("Produtor Excluído")));

    const dup = await criarProdutor(admin, { userId: pessoa.id });
    expect(dup.status).toBe(409);
    const corpo = await json(dup);
    expect(corpo.meta).toEqual({ codigo: "PRODUTOR_EXCLUIDO" });
    expect(corpo.erros[0]).toContain(`/produtores/${produtorExcluido}/reativar`);

    // Técnico não enxerga o perfil excluído que o admin cadastrou
    expect(
      (await app.request(`/produtores/${produtorExcluido}/reativar`, comCookie(tecnico, { method: "POST" })))
        .status,
    ).toBe(404);

    const reativa = await app.request(
      `/produtores/${produtorExcluido}/reativar`,
      comCookie(admin, { method: "POST" }),
    );
    expect(reativa.status).toBe(200);
    expect((await json<Produtor>(reativa)).data).toMatchObject({ id: produtorExcluido, userId: pessoa.id });

    const deNovo = await app.request(
      `/produtores/${produtorExcluido}/reativar`,
      comCookie(admin, { method: "POST" }),
    );
    expect(deNovo.status).toBe(409);
    expect((await json(deNovo)).meta).toEqual({ codigo: "PRODUTOR_ATIVO" });
  });

  it("trigger registrou INSERT, DELETE (soft) e UPDATE (reativar) com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(eq(historicoAlteracao.tabela, "produtores"), eq(historicoAlteracao.registroId, produtorExcluido)),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "DELETE", "UPDATE"]);
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
