import { expect } from "@playwright/test";
import { ADMIN, SENHA_PADRAO, apiFetch, apiLogin, login, toast, test } from "./helpers";

test.describe("Login", () => {
  test("senha errada mostra o erro e fica em /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(ADMIN);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(toast(page, "Não foi possível entrar")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  });

  test("senha certa entra no dashboard com o nome no menu; sair volta ao login", async ({ page }) => {
    // Nome do usuário vem da sessão (ADMIN_NAME do .env pode mudar o seed).
    const cookie = await apiLogin(ADMIN, SENHA_PADRAO);
    const sessao = (await (await apiFetch("/auth/get-session", {}, cookie)).json()) as {
      user: { name: string };
    };

    await login(page, ADMIN, SENHA_PADRAO);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(sessao.user.name)).toBeVisible();
    await expect(page.getByText(ADMIN)).toBeVisible();

    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL("**/login");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  });

  test("rota protegida sem sessão vai ao login com `next` e volta a ela após entrar", async ({ page }) => {
    await page.goto("/papeis");
    await expect(page).toHaveURL(/\/login\?next=(\/|%2F)papeis$/);

    await page.getByLabel("E-mail", { exact: true }).fill(ADMIN);
    await page.getByLabel("Senha", { exact: true }).fill(SENHA_PADRAO);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL(/\/papeis$/);
    await expect(page.getByRole("heading", { level: 1, name: "Papéis" })).toBeVisible();
  });
});
