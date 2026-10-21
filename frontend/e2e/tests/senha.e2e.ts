import { expect } from "@playwright/test";
import {
  apiLogin,
  criarUsuario,
  emailUnico,
  login,
  removerUsuario,
  SENHA_TEMPORARIA,
  toast,
  test,
} from "./helpers";

/**
 * Troca da própria senha (diálogo "Trocar senha" do rodapé do menu) com uma
 * conta temporária: a senha errada é recusada no campo; a certa troca de
 * verdade — a nova entra pela tela e a antiga deixa de valer na API.
 */
test.describe("Trocar senha", () => {
  let admin: string;
  let email: string;
  const NOVA = "nova-senha-e2e";

  test.beforeAll(async () => {
    admin = await apiLogin();
  });

  test.beforeEach(async () => {
    email = emailUnico("e2e-senha");
    await criarUsuario(admin, { email, papel: "usuario" });
  });

  test.afterEach(async () => {
    await removerUsuario(admin, email);
  });

  test("senha atual errada marca o campo; a certa troca e a nova entra", async ({ page }) => {
    await login(page, email, SENHA_TEMPORARIA);

    await page.getByRole("button", { name: "Trocar senha", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Trocar senha" });
    const atual = dialogo.getByLabel("Senha atual", { exact: true });

    // ── Senha atual errada: erro ligado ao campo, diálogo continua aberto ──
    await atual.fill("senha-errada-e2e");
    await dialogo.getByLabel("Nova senha", { exact: true }).fill(NOVA);
    await dialogo.getByLabel("Confirmar nova senha", { exact: true }).fill(NOVA);
    await dialogo.getByRole("button", { name: "Trocar senha", exact: true }).click();

    await expect(atual).toHaveAttribute("aria-invalid", "true");
    await expect(atual).toHaveAccessibleDescription("Senha atual incorreta.");
    await expect(atual).toBeFocused();

    // ── Senha atual certa ──
    await atual.fill(SENHA_TEMPORARIA);
    await expect(atual).not.toHaveAttribute("aria-invalid", "true");
    await dialogo.getByRole("button", { name: "Trocar senha", exact: true }).click();
    await expect(toast(page, "Senha alterada com sucesso.")).toBeVisible();
    await expect(dialogo).toHaveCount(0);

    // ── Sai e entra com a nova pela tela; a antiga não vale mais na API ──
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL("**/login");
    await login(page, email, NOVA);
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(apiLogin(email, SENHA_TEMPORARIA)).rejects.toThrow(/Login na API falhou/);
    await expect(apiLogin(email, NOVA)).resolves.toMatch(/better-auth\.session_token=/);
  });
});
