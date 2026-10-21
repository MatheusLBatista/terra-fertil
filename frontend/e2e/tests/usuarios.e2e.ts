import { expect } from "@playwright/test";
import {
  apiLogin,
  buscarUsuario,
  emailUnico,
  login,
  removerUsuario,
  SENHA_TEMPORARIA,
  toast,
  test,
  verEDispensarToast,
} from "./helpers";

/**
 * Administração de usuários de ponta a ponta (plugin admin do better-auth):
 * criar, editar, banir/desbanir, trocar o papel (com a confirmação de admin) e
 * remover — cada passo na tela conferido em `/auth/admin/list-users`.
 */
test.describe("Usuários — administração pela tela", () => {
  let admin: string;
  let email: string;

  /** Estado da conta no servidor (a tela pode estar otimista). */
  const naApi = () => buscarUsuario(admin, email);

  test.beforeAll(async () => {
    admin = await apiLogin();
  });

  test.beforeEach(async ({ page }) => {
    email = emailUnico("e2e-adm");
    await login(page);
    await page.goto("/usuarios");
  });

  // Limpeza pela API: se algum passo falhou antes de "Remover", a conta não fica no banco.
  test.afterEach(async () => {
    await removerUsuario(admin, email);
  });

  test("cria, edita, bane, desbane, troca o papel e remove um usuário", async ({ page }) => {
    // ── Criar ──
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const novo = page.getByRole("dialog", { name: "Novo usuário" });
    await novo.getByLabel("Nome", { exact: true }).fill("Pessoa E2E");
    await novo.getByLabel("E-mail", { exact: true }).fill(email);
    await novo.getByLabel("Senha inicial", { exact: true }).fill(SENHA_TEMPORARIA);
    await novo.getByLabel("Papel", { exact: true }).selectOption("usuario");
    await novo.getByRole("button", { name: "Criar usuário", exact: true }).click();

    await verEDispensarToast(page, "Usuário criado");
    await expect(novo).toHaveCount(0);
    expect(await naApi()).toMatchObject({ email, name: "Pessoa E2E", role: "usuario" });

    // A busca (debounce, na URL) isola a linha da conta nova.
    await page.getByRole("textbox", { name: "Buscar por e-mail" }).fill(email);
    const linha = page.getByRole("row").filter({ hasText: email });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText("Pessoa E2E");
    await expect(linha).toContainText("Ativo");

    // ── Editar ──
    await linha.getByRole("button", { name: `Editar ${email}`, exact: true }).click();
    const editar = page.getByRole("dialog", { name: "Editar usuário" });
    await expect(editar.getByLabel("E-mail", { exact: true })).toHaveValue(email);
    await editar.getByLabel("Nome", { exact: true }).fill("Pessoa E2E Editada");
    await editar.getByRole("button", { name: "Salvar", exact: true }).click();

    await verEDispensarToast(page, "Usuário atualizado.");
    await expect(linha).toContainText("Pessoa E2E Editada");
    expect(await naApi()).toMatchObject({ name: "Pessoa E2E Editada" });

    // ── Banir (ConfirmacaoDialog com motivo) ──
    await linha.getByRole("button", { name: `Banir ${email}`, exact: true }).click();
    const banir = page.getByRole("alertdialog", { name: "Banir usuário" });
    await expect(banir).toContainText(email);
    await banir.getByLabel("Motivo (opcional)").fill("teste e2e");
    await banir.getByRole("button", { name: "Banir", exact: true }).click();

    await verEDispensarToast(page, "Usuário banido");
    await expect(banir).toHaveCount(0);
    await expect(linha).toContainText("Banido — teste e2e");
    expect(await naApi()).toMatchObject({ banned: true, banReason: "teste e2e" });

    // ── Desbanir ──
    await linha.getByRole("button", { name: `Desbanir ${email}`, exact: true }).click();
    await verEDispensarToast(page, "Usuário desbanido.");
    await expect(linha).toContainText("Ativo");
    await expect.poll(async () => (await naApi())?.banned ?? null).toBeFalsy();

    // ── Papel: usuario → gestor aplica direto; → admin pede confirmação ──
    const papel = linha.getByRole("combobox", { name: `Papel de ${email}` });
    await papel.selectOption("gestor");
    await verEDispensarToast(page, "Papel atualizado.");
    await expect.poll(async () => (await naApi())?.role).toBe("gestor");
    await expect(papel).toHaveValue("gestor");

    await papel.selectOption("admin");
    const tornarAdmin = page.getByRole("alertdialog", { name: "Tornar administrador?" });
    await expect(tornarAdmin).toContainText(email);
    await tornarAdmin.getByRole("button", { name: "Alterar papel", exact: true }).click();
    await verEDispensarToast(page, "Papel atualizado.");
    await expect(tornarAdmin).toHaveCount(0);
    await expect.poll(async () => (await naApi())?.role).toBe("admin");
    await expect(papel).toHaveValue("admin");

    // ── Remover ──
    await linha.getByRole("button", { name: `Remover ${email}`, exact: true }).click();
    const remover = page.getByRole("alertdialog", { name: "Remover usuário" });
    await expect(remover).toContainText(email);
    await remover.getByRole("button", { name: "Remover", exact: true }).click();

    await expect(toast(page, "Usuário removido.")).toBeVisible();
    await expect(linha).toHaveCount(0);
    expect(await naApi()).toBeUndefined();
  });
});
