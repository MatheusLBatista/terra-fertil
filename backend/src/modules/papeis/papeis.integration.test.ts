import { randomUUID } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { papel } from "../../db/papel.ts";
import { user } from "../../db/user.ts";
import { anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Ciclo de vida de um papel pela API, contra o banco de teste: os `it` são
 * ENCADEADOS de propósito (criar → conflito → alterar → permissões → listar →
 * excluir → recriar → histórico) e leem o `id` criado no primeiro passo.
 *
 * O nome é único por rodada (prefixo `teste-` + sufixo aleatório) para não
 * colidir com o seed nem com sobras de uma rodada interrompida; o setup.ts
 * remove tudo com o prefixo antes/depois do arquivo.
 */
type PapelResposta = {
  id: string;
  nome: string;
  descricao: string | null;
  permissoes: { acao: string; subject: string }[];
};

const NOME = `${PREFIXO_TESTE}${randomUUID().slice(0, 8)}`;

let cookie: string;
let adminId: string;
let adminPapelId: string;
let id: string;

const linhasDeHistorico = async (registroId: string) => {
  const [r] = await db
    .select({ n: count() })
    .from(historicoAlteracao)
    .where(and(eq(historicoAlteracao.tabela, "papeis"), eq(historicoAlteracao.registroId, registroId)));
  return r.n;
};

beforeAll(async () => {
  cookie = await login("fslab.vilhena@ifro.edu.br");
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));
  adminId = admin.id;
  const [papelAdmin] = await db.select({ id: papel.id }).from(papel).where(eq(papel.nome, "admin"));
  adminPapelId = papelAdmin.id;
});

afterAll(async () => {
  await db.delete(papel).where(eq(papel.nome, NOME)); // hard delete — permissões caem pelo cascade
});

describe("gates: requireAuth + requirePermission", () => {
  it("POST /papeis sem cookie responde 401 e não grava nada", async () => {
    const res = await app.request("/papeis", anonima({ method: "POST", json: { nome: NOME } }));

    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
    expect(await db.select({ id: papel.id }).from(papel).where(eq(papel.nome, NOME))).toEqual([]);
  });

  it("POST /papeis com usuario@example.com (papel sem permissão) responde 403 e não grava nada", async () => {
    const cookieUsuario = await login("usuario@example.com");
    const res = await app.request(
      "/papeis",
      comCookie(cookieUsuario, { method: "POST", json: { nome: NOME } }),
    );

    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Acesso negado: permissão insuficiente"] });
    expect(await db.select({ id: papel.id }).from(papel).where(eq(papel.nome, NOME))).toEqual([]);
  });
});

describe("ciclo de vida de um papel", () => {
  it("POST /papeis cria o papel com permissões (201)", async () => {
    const res = await app.request(
      "/papeis",
      comCookie(cookie, {
        method: "POST",
        json: { nome: NOME, descricao: "Papel de teste", permissoes: [{ acao: "read", subject: "Papel" }] },
      }),
    );

    expect(res.status).toBe(201);
    const corpo = await json<PapelResposta>(res);
    // Envelope completo: item único sai com meta vazio e erros vazio
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        nome: NOME,
        descricao: "Papel de teste",
        permissoes: [{ acao: "read", subject: "Papel" }],
      },
      meta: {},
      erros: [],
    });
    id = corpo.data.id;
  });

  it("POST /papeis com o mesmo nome responde 409", async () => {
    const res = await app.request("/papeis", comCookie(cookie, { method: "POST", json: { nome: NOME } }));

    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "PAPEL_DUPLICADO" },
      erros: [`Já existe um papel "${NOME}"`],
    });
  });

  it("PATCH /papeis/:id altera a descrição e preserva as permissões (200)", async () => {
    const res = await app.request(
      `/papeis/${id}`,
      comCookie(cookie, { method: "PATCH", json: { descricao: "Alterado" } }),
    );

    expect(res.status).toBe(200);
    const corpo = await json<PapelResposta>(res);
    expect(corpo.data).toMatchObject({ id, nome: NOME, descricao: "Alterado" });
    expect(corpo.data.permissoes).toEqual([{ acao: "read", subject: "Papel" }]);
  });

  it("PATCH /papeis/:id sem mudança real não gera linha no histórico (trigger ignora no-op)", async () => {
    const antes = await linhasDeHistorico(id);
    const res = await app.request(
      `/papeis/${id}`,
      comCookie(cookie, { method: "PATCH", json: { descricao: "Alterado" } }),
    );

    expect(res.status).toBe(200);
    expect(await linhasDeHistorico(id)).toBe(antes);
  });

  it("PUT /papeis/:id/permissoes substitui o conjunto sem duplicatas (200) e persiste", async () => {
    const permissoes = [
      { acao: "update", subject: "Papel" },
      { acao: "read", subject: "Papel" },
      { acao: "read", subject: "Papel" }, // duplicada de propósito
    ];
    const res = await app.request(
      `/papeis/${id}/permissoes`,
      comCookie(cookie, { method: "PUT", json: { permissoes } }),
    );

    expect(res.status).toBe(200);
    const esperado = [
      { acao: "read", subject: "Papel" },
      { acao: "update", subject: "Papel" },
    ];
    expect((await json<PapelResposta>(res)).data.permissoes).toEqual(esperado);

    const detalhe = await app.request(`/papeis/${id}`, comCookie(cookie));
    expect(detalhe.status).toBe(200);
    expect((await json<PapelResposta>(detalhe)).data.permissoes).toEqual(esperado);
  });

  it("GET /papeis?sort=nome:desc lista em ordem decrescente de nome", async () => {
    const res = await app.request("/papeis?sort=nome:desc&limit=200", comCookie(cookie));

    expect(res.status).toBe(200);
    const corpo = await json<{ nome: string }[]>(res);
    const nomes = corpo.data.map((p) => p.nome);

    // Ordem relativa entre os nomes conhecidos (independe de collation em hífen/dígitos)
    expect(nomes.indexOf("usuario")).toBeLessThan(nomes.indexOf(NOME));
    expect(nomes.indexOf(NOME)).toBeLessThan(nomes.indexOf("gestor"));
    expect(nomes.indexOf("gestor")).toBeLessThan(nomes.indexOf("admin"));
    expect(corpo.meta).toMatchObject({ total: nomes.length, limit: 200, offset: 0 });
  });

  it("GET /papeis?incluir=permissoes anexa as permissões de cada papel", async () => {
    const res = await app.request(`/papeis?incluir=permissoes&nome=${NOME}`, comCookie(cookie));

    expect(res.status).toBe(200);
    const corpo = await json<PapelResposta[]>(res);
    expect(corpo.data).toHaveLength(1);
    expect(corpo.data[0].permissoes).toEqual([
      { acao: "read", subject: "Papel" },
      { acao: "update", subject: "Papel" },
    ]);

    // Sem o flag, o item não traz `permissoes`
    const sem = await app.request(`/papeis?nome=${NOME}`, comCookie(cookie));
    expect((await json<PapelResposta[]>(sem)).data[0]).not.toHaveProperty("permissoes");
  });

  it("GET /papeis?nome= vazio ou só espaços não filtra (filtroTexto) nem responde 400", async () => {
    const todos = await json<unknown[]>(await app.request("/papeis?limit=200", comCookie(cookie)));

    for (const nome of ["", "%20%20"]) {
      const res = await app.request(`/papeis?limit=200&nome=${nome}`, comCookie(cookie));
      expect(res.status).toBe(200);
      expect((await json<unknown[]>(res)).meta.total).toBe(todos.meta.total);
    }

    // Espaços nas pontas são aparados antes do ilike
    const aparado = await app.request(`/papeis?nome=%20${NOME}%20`, comCookie(cookie));
    expect((await json<PapelResposta[]>(aparado)).data.map((p) => p.nome)).toEqual([NOME]);
  });

  it("GET /papeis?nome=% não usa o curinga do LIKE (escaparLike)", async () => {
    const res = await app.request("/papeis?nome=%25", comCookie(cookie));

    expect(res.status).toBe(200);
    expect((await json<unknown[]>(res)).data).toEqual([]);
  });

  it("GET /papeis com sort fora da allowlist responde 400", async () => {
    const res = await app.request("/papeis?sort=id:asc", comCookie(cookie));

    expect(res.status).toBe(400);
    const corpo = await json(res);
    expect(corpo.erros[0]).toContain("Campo de ordenação inválido");
    // meta.campos: mensagem por campo, para o formulário marcar o input
    expect(corpo.meta).toEqual({ campos: { sort: expect.stringContaining("Campo de ordenação inválido") } });
  });

  it("POST /papeis inválido responde 400 com erros[] e meta.campos em pt-BR", async () => {
    const res = await app.request("/papeis", comCookie(cookie, { method: "POST", json: { nome: "" } }));

    expect(res.status).toBe(400);
    const corpo = await json(res);
    expect(corpo.erros[0]).toMatch(/^nome: /);
    expect(corpo.meta).toEqual({ campos: { nome: expect.any(String) } });
    expect(corpo.erros[0]).not.toMatch(/Too small|expected/);
  });

  it("DELETE /papeis/:id faz soft delete (204) e o GET passa a responder 404", async () => {
    const res = await app.request(`/papeis/${id}`, comCookie(cookie, { method: "DELETE" }));
    expect(res.status).toBe(204);

    const depois = await app.request(`/papeis/${id}`, comCookie(cookie));
    expect(depois.status).toBe(404);
    expect(await json(depois)).toEqual({ data: [], meta: {}, erros: ["Papel não encontrado"] });

    // A linha continua no banco, só marcada (unique total do nome + auditoria)
    const [linha] = await db.select({ deletedAt: papel.deletedAt }).from(papel).where(eq(papel.id, id));
    expect(linha.deletedAt).toBeInstanceOf(Date);
  });

  it("POST /papeis com o nome do papel excluído responde 409 orientando a reativar", async () => {
    const res = await app.request("/papeis", comCookie(cookie, { method: "POST", json: { nome: NOME } }));

    expect(res.status).toBe(409);
    const corpo = await json(res);
    expect(corpo.erros).toHaveLength(1);
    expect(corpo.erros[0]).toContain("reative-o");
  });

  it("trigger trg_historico registrou INSERT, UPDATE e DELETE do papel com o usuário da sessão", async () => {
    const linhas = await db
      .select({
        operacao: historicoAlteracao.operacao,
        alteradoPor: historicoAlteracao.alteradoPor,
        dadosAnteriores: historicoAlteracao.dadosAnteriores,
        dadosNovos: historicoAlteracao.dadosNovos,
      })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "papeis"), eq(historicoAlteracao.registroId, id)))
      .orderBy(asc(historicoAlteracao.id));

    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
    // created_by/updated_by vieram do AsyncLocalStorage (requireAuth), não de parâmetro
    expect(linhas.map((l) => l.alteradoPor)).toEqual([adminId, adminId, adminId]);

    const [inserido, alterado, excluido] = linhas;
    expect(inserido.dadosAnteriores).toBeNull();
    expect(inserido.dadosNovos).toMatchObject({ nome: NOME, descricao: "Papel de teste" });
    expect(alterado.dadosAnteriores).toMatchObject({ descricao: "Papel de teste" });
    expect(alterado.dadosNovos).toMatchObject({ descricao: "Alterado" });
    // Soft delete: UPDATE que preenche deleted_at é registrado como DELETE
    expect((excluido.dadosAnteriores as { deleted_at: unknown }).deleted_at).toBeNull();
    expect((excluido.dadosNovos as { deleted_at: unknown }).deleted_at).toEqual(expect.any(String));
  });

  it("POST /papeis/:id/reativar desfaz o soft delete (200) e o GET volta a responder", async () => {
    const res = await app.request(`/papeis/${id}/reativar`, comCookie(cookie, { method: "POST" }));

    expect(res.status).toBe(200);
    const corpo = await json<PapelResposta>(res);
    expect(corpo.data).toMatchObject({ id, nome: NOME });
    // O soft delete do papel não toca as permissões — voltam como estavam
    expect(corpo.data.permissoes).toEqual([
      { acao: "read", subject: "Papel" },
      { acao: "update", subject: "Papel" },
    ]);

    const depois = await app.request(`/papeis/${id}`, comCookie(cookie));
    expect(depois.status).toBe(200);
  });

  it("POST /papeis/:id/reativar em papel ativo responde 409 com meta.codigo", async () => {
    const res = await app.request(`/papeis/${id}/reativar`, comCookie(cookie, { method: "POST" }));

    expect(res.status).toBe(409);
    const corpo = await json(res);
    expect(corpo.erros[0]).toContain("não está excluído");
    expect(corpo.meta).toEqual({ codigo: "PAPEL_ATIVO" });
  });

  it("POST /papeis/:id/reativar com id inexistente responde 404", async () => {
    const res = await app.request(`/papeis/${randomUUID()}/reativar`, comCookie(cookie, { method: "POST" }));

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Papel não encontrado"] });
  });
});

describe("papéis de sistema e anti-bloqueio (admin logado)", () => {
  it("PATCH renomeando o admin responde 409", async () => {
    const res = await app.request(
      `/papeis/${adminPapelId}`,
      comCookie(cookie, { method: "PATCH", json: { nome: "root" } }),
    );

    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      data: [],
      meta: { codigo: "PAPEL_DE_SISTEMA" },
      erros: [expect.stringContaining("não pode ser renomeado")],
    });
  });

  it("DELETE do admin responde 409", async () => {
    const res = await app.request(`/papeis/${adminPapelId}`, comCookie(cookie, { method: "DELETE" }));

    expect(res.status).toBe(409);
    expect((await json(res)).erros[0]).toContain("não pode ser excluído");
  });

  it("PUT permissoes vazias no admin responde 409", async () => {
    const res = await app.request(
      `/papeis/${adminPapelId}/permissoes`,
      comCookie(cookie, { method: "PUT", json: { permissoes: [] } }),
    );

    expect(res.status).toBe(409);
    expect((await json(res)).erros[0]).toContain("não pode ficar sem permissões");
  });

  it("PUT removendo manage all do PRÓPRIO papel responde 409 e nada muda", async () => {
    const res = await app.request(
      `/papeis/${adminPapelId}/permissoes`,
      comCookie(cookie, { method: "PUT", json: { permissoes: [{ acao: "read", subject: "Papel" }] } }),
    );

    expect(res.status).toBe(409);
    expect((await json(res)).meta).toEqual({ codigo: "AUTO_BLOQUEIO" });

    const detalhe = await json<PapelResposta>(
      await app.request(`/papeis/${adminPapelId}`, comCookie(cookie)),
    );
    expect(detalhe.data.permissoes).toEqual([{ acao: "manage", subject: "all" }]);
  });
});
