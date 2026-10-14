import { describe, expect, it } from "vitest";
import app from "./app.ts";
import { anonima, comCookie, json, login } from "./test/http.ts";

/**
 * Contratos transversais da API (skill testes-integracao): envelope, saúde,
 * limites de corpo, gates de autenticação/autorização. Cada módulo cobre o
 * próprio CRUD em `<entidade>.integration.test.ts`.
 */

describe("envelope e saúde", () => {
  it("rota inexistente responde 404 no envelope { data, meta, erros }", async () => {
    const res = await app.request("/rota-que-nao-existe", anonima());

    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({
      data: [],
      meta: {},
      erros: ["Rota não encontrada: GET /rota-que-nao-existe"],
    });
  });

  it("/ping responde 200 no envelope", async () => {
    const res = await app.request("/ping", anonima());

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: { status: "ok" }, meta: {}, erros: [] });
  });

  it("/health responde 200 com o banco ok", async () => {
    const res = await app.request("/health", anonima());

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: { status: "ok", db: "ok" }, meta: {}, erros: [] });
  });
});

describe("x-request-id", () => {
  it("ecoa um UUID enviado pelo cliente", async () => {
    const res = await app.request(
      "/ping",
      anonima({ headers: { "x-request-id": "3F1E2D3C-4B5A-4C6D-8E7F-9A0B1C2D3E4F" } }),
    );

    expect(res.headers.get("x-request-id")).toBe("3f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f");
  });

  it("descarta valor que não é UUID e gera um novo", async () => {
    const res = await app.request(
      "/ping",
      anonima({ headers: { "x-request-id": "<script>forjado</script>" } }),
    );

    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("POST /logs (logs do frontend)", () => {
  it("rejeita payload inválido com 400 no envelope", async () => {
    const res = await app.request("/logs", anonima({ method: "POST", json: { logs: [] } }));

    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Payload de logs inválido"] });
  });

  it("aceita um lote válido com 202 e o total recebido (userId do cliente é ignorado)", async () => {
    const logs = [
      { level: "info", message: "teste de integração", component: "app.integration.test", userId: "forjado" },
      { level: "error", message: "erro simulado", url: "/dashboard" },
    ];
    const res = await app.request("/logs", anonima({ method: "POST", json: { logs } }));

    expect(res.status).toBe(202);
    expect(await json(res)).toEqual({ data: { recebidos: 2 }, meta: {}, erros: [] });
  });
});

describe("corpo da requisição", () => {
  it("JSON acima de 1 MB responde 413 no envelope", async () => {
    const body = JSON.stringify({ logs: [{ level: "info", message: "x".repeat(1024 * 1024 + 1) }] });
    const res = await app.request(
      "/logs",
      anonima({ method: "POST", headers: { "Content-Type": "application/json" }, body }),
    );

    expect(res.status).toBe(413);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Corpo da requisição muito grande"] });
  });

  it("corpo que não é application/json responde 415 no envelope", async () => {
    const body = "nome=teste";
    const res = await app.request(
      "/logs",
      anonima({
        method: "POST",
        headers: { "Content-Type": "text/plain", "Content-Length": String(body.length) },
        body,
      }),
    );

    expect(res.status).toBe(415);
    expect(await json(res)).toEqual({
      data: [],
      meta: {},
      erros: ["Corpo da requisição precisa ser application/json"],
    });
  });

  it("JSON inválido responde 400 no envelope", async () => {
    const res = await app.request(
      "/logs",
      anonima({ method: "POST", headers: { "Content-Type": "application/json" }, body: '{"logs": [' }),
    );

    expect(res.status).toBe(400);
    const corpo = await json(res);
    expect(corpo).toMatchObject({ data: [], meta: {} });
    expect(corpo.erros).toHaveLength(1);
    expect(corpo.erros[0]).toMatch(/JSON/);
  });
});

describe("autenticação e autorização", () => {
  it("responde 401 em /papeis sem cookie de sessão", async () => {
    const res = await app.request("/papeis", anonima());

    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("login do admin devolve set-cookie e o cookie abre /papeis (200)", async () => {
    const cookie = await login("admin@example.com");
    expect(cookie).toContain("better-auth.session_token=");

    const res = await app.request("/papeis", comCookie(cookie));

    expect(res.status).toBe(200);
    const corpo = await json<{ nome: string }[]>(res);
    expect(corpo.erros).toEqual([]);
    expect(corpo.meta).toMatchObject({ total: expect.any(Number), limit: 10, offset: 0 });
    expect(corpo.data.map((p) => p.nome)).toEqual(expect.arrayContaining(["admin", "gestor", "usuario"]));
  });

  it("login com senha errada responde 401 com mensagem em pt-BR e o `code` intacto", async () => {
    const res = await app.request(
      "/auth/sign-in/email",
      anonima({ method: "POST", json: { email: "admin@example.com", password: "senha-errada" } }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "E-mail ou senha inválidos",
    });
  });

  it("responde 403 em /papeis para usuario@example.com (papel sem permissão)", async () => {
    const cookie = await login("usuario@example.com");
    const res = await app.request("/papeis", comCookie(cookie));

    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Acesso negado: permissão insuficiente"] });
  });
});
