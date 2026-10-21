import { expect } from "@playwright/test";
import { apiFetch, apiLogin, criarUsuario, emailUnico, login, menu, removerUsuario, test } from "./helpers";

/**
 * Gate de permissão por papel: a tela esconde o que o backend recusaria
 * (menu + estado "Acesso restrito") e o backend de fato recusa (403).
 *
 * Contas próprias, criadas pela API do admin: o teste não depende do estado das
 * contas demo do seed (gestor@/usuario@ podem ter sido banidas ou trocadas de papel).
 */
test.describe("Permissões por papel", () => {
  let admin: string;
  const usuario = emailUnico("e2e-usuario");
  const gestor = emailUnico("e2e-gestor");

  test.beforeAll(async () => {
    admin = await apiLogin();
    await criarUsuario(admin, { email: usuario, papel: "usuario", nome: "Usuário E2E" });
    await criarUsuario(admin, { email: gestor, papel: "gestor", nome: "Gestor E2E" });
  });

  test.afterAll(async () => {
    await removerUsuario(admin, usuario);
    await removerUsuario(admin, gestor);
  });

  test("usuario: /papeis, /usuarios e /historico ficam restritos e fora do menu", async ({ page }) => {
    await login(page, usuario);

    const itens = menu(page);
    await expect(itens.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(itens.getByRole("link", { name: "Papéis", exact: true })).toHaveCount(0);
    await expect(itens.getByRole("link", { name: "Usuários", exact: true })).toHaveCount(0);
    await expect(itens.getByRole("link", { name: "Histórico", exact: true })).toHaveCount(0);

    await page.goto("/papeis");
    await expect(page.getByText("Acesso restrito", { exact: true })).toBeVisible();
    await expect(page.getByText("Somente administradores gerenciam papéis e permissões.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo papel" })).toHaveCount(0);

    await page.goto("/usuarios");
    await expect(page.getByText("Acesso restrito", { exact: true })).toBeVisible();
    await expect(page.getByText("Somente administradores gerenciam usuários e papéis.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo usuário" })).toHaveCount(0);

    await page.goto("/historico");
    await expect(page.getByText("Acesso restrito", { exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    // O gate de verdade é o do servidor: a API recusa o papel mesmo sem a tela.
    const cookie = await apiLogin(usuario);
    expect((await apiFetch("/papeis", {}, cookie)).status).toBe(403);
    expect((await apiFetch("/historico", {}, cookie)).status).toBe(403);
    expect((await apiFetch("/auth/admin/list-users", {}, cookie)).status).toBe(403);
  });

  test("gestor: /historico visível; usuários e papéis fora do menu", async ({ page }) => {
    await login(page, gestor);

    const itens = menu(page);
    await expect(itens.getByRole("link", { name: "Histórico", exact: true })).toBeVisible();
    await expect(itens.getByRole("link", { name: "Usuários", exact: true })).toHaveCount(0);
    await expect(itens.getByRole("link", { name: "Papéis", exact: true })).toHaveCount(0);

    await itens.getByRole("link", { name: "Histórico", exact: true }).click();
    await expect(page).toHaveURL(/\/historico$/);
    await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeVisible();
    await expect(page.getByText("Acesso restrito", { exact: true })).toHaveCount(0);

    // A API concorda: lê a auditoria, mas não administra usuários nem papéis.
    const cookie = await apiLogin(gestor);
    expect((await apiFetch("/historico", {}, cookie)).status).toBe(200);
    expect((await apiFetch("/papeis", {}, cookie)).status).toBe(403);
    expect((await apiFetch("/auth/admin/list-users", {}, cookie)).status).toBe(403);
  });
});
