import { expect } from "@playwright/test";
import { ADMIN, ADMIN_SENHA, apiFetch, apiLogin, login, nomeUnico, test } from "./helpers";

test.describe("Login", () => {
  test("senha errada mostra o erro ligado aos campos e fica em /login", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel("E-mail", { exact: true });
    const senha = page.getByLabel("Senha", { exact: true });
    await email.fill(ADMIN);
    await senha.fill("senha-errada");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    // Erro inline (role="alert") descrevendo os dois campos, marcados como inválidos.
    const mensagem = "Não foi possível entrar. Verifique e-mail e senha.";
    await expect(senha).toHaveAttribute("aria-invalid", "true");
    await expect(senha).toHaveAccessibleDescription(mensagem);
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();

    // Editar o campo limpa o erro.
    await senha.fill("outra");
    await expect(senha).not.toHaveAttribute("aria-invalid", "true");
    await expect(senha).toHaveAccessibleDescription("");
  });

  test("senha certa entra no dashboard com o nome no menu; sair volta ao login", async ({ page }) => {
    // Nome do usuário vem da sessão (ADMIN_NAME do .env pode mudar o seed).
    const cookie = await apiLogin(ADMIN, ADMIN_SENHA);
    const sessao = (await (await apiFetch("/auth/get-session", {}, cookie)).json()) as {
      user: { name: string };
    };

    await login(page, ADMIN, ADMIN_SENHA);
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
    await page.getByLabel("Senha", { exact: true }).fill(ADMIN_SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL(/\/papeis$/);
    await expect(page.getByRole("heading", { level: 1, name: "Papéis" })).toBeVisible();
  });

  test("recuperar senha: a confirmação é anunciada e recebe o foco", async ({ page }) => {
    // E-mail sem conta: a resposta é a mesma (não confirmamos cadastros) e nada é enviado.
    await page.goto("/recuperar-senha");
    await page.getByLabel("E-mail", { exact: true }).fill(`${nomeUnico("e2e-sem-conta")}@example.com`);
    await page.getByRole("button", { name: "Enviar link", exact: true }).click();

    const titulo = page.getByRole("heading", { level: 1, name: "Verifique seu e-mail" });
    await expect(titulo).toBeFocused();
    // Filtra pelo texto: a pílula de ambiente (NEXT_PUBLIC_AMBIENTE) também é role="status".
    await expect(
      page.getByRole("status").filter({ hasText: "Pedido enviado. Verifique seu e-mail." }),
    ).toHaveCount(1);
  });
});
