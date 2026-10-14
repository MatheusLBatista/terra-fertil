import { expect } from "@playwright/test";
import { GESTOR, SENHA_PADRAO, apiFetch, apiLogin, login, menu, nomeUnico, test } from "./helpers";

/**
 * Gate de permissão por papel: a tela esconde o que o backend recusaria
 * (menu + estado "Acesso restrito") e o backend de fato recusa (403).
 */
test.describe("Permissões por papel", () => {
  let admin: string;
  // Conta própria com papel "usuario", criada pela API do admin: o teste não
  // depende do estado da usuario@example.com do seed (pode ter sido banida na tela).
  const usuario = { email: `${nomeUnico("e2e-usuario")}@example.com`, id: "" };

  test.beforeAll(async () => {
    admin = await apiLogin();
    const r = await apiFetch(
      "/auth/admin/create-user",
      {
        method: "POST",
        body: JSON.stringify({
          email: usuario.email,
          password: SENHA_PADRAO,
          name: "Usuário E2E",
          role: "usuario",
        }),
      },
      admin,
    );
    expect(r.status, "criar usuário temporário").toBe(200);
    usuario.id = ((await r.json()) as { user: { id: string } }).user.id;
  });

  test.afterAll(async () => {
    if (usuario.id) {
      await apiFetch(
        "/auth/admin/remove-user",
        { method: "POST", body: JSON.stringify({ userId: usuario.id }) },
        admin,
      );
    }
  });

  test("usuario: /papeis e /usuarios ficam restritos e fora do menu", async ({ page }) => {
    await login(page, usuario.email);

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

    // O gate de verdade é o do servidor: a API recusa o papel mesmo sem a tela.
    const cookie = await apiLogin(usuario.email);
    expect((await apiFetch("/papeis", {}, cookie)).status).toBe(403);
  });

  test("gestor: /historico visível; usuários e papéis fora do menu", async ({ page }) => {
    await login(page, GESTOR);

    const itens = menu(page);
    await expect(itens.getByRole("link", { name: "Histórico", exact: true })).toBeVisible();
    await expect(itens.getByRole("link", { name: "Usuários", exact: true })).toHaveCount(0);
    await expect(itens.getByRole("link", { name: "Papéis", exact: true })).toHaveCount(0);

    await itens.getByRole("link", { name: "Histórico", exact: true }).click();
    await expect(page).toHaveURL(/\/historico$/);
    await expect(page.getByRole("heading", { level: 1, name: "Histórico" })).toBeVisible();
    await expect(page.getByText("Acesso restrito", { exact: true })).toHaveCount(0);
  });
});
