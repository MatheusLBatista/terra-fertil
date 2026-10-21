import { expect } from "@playwright/test";
import { apiFetch, apiLogin, login, nomeUnico, toast, type Envelope, test } from "./helpers";

type Papel = { id: string; nome: string; descricao: string | null };
type Permissao = { acao: string; subject: string };

/** CRUD de papéis de ponta a ponta: cada passo na tela é conferido na API. */
test.describe("Papéis — CRUD pela tela", () => {
  let cookie: string;
  let nome: string;

  const buscarPorNome = async () => {
    const r = await apiFetch(`/papeis?nome=${encodeURIComponent(nome)}`, {}, cookie);
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as Envelope<Papel[]>;
    return data.find((p) => p.nome === nome);
  };

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test.beforeEach(async ({ page }) => {
    nome = nomeUnico("e2e");
    await login(page);
    await page.goto("/papeis");
  });

  // Limpeza pela API: se algum passo falhou antes do DELETE, o papel não fica no banco.
  test.afterEach(async () => {
    const sobra = await buscarPorNome();
    if (sobra) await apiFetch(`/papeis/${sobra.id}`, { method: "DELETE" }, cookie);
  });

  test("cria, edita e exclui um papel", async ({ page }) => {
    // ── Criar ──
    await page.getByRole("button", { name: "Novo papel" }).click();
    const novo = page.getByRole("dialog", { name: "Novo papel" });
    await novo.getByLabel("Nome", { exact: true }).fill(nome);
    await novo.getByLabel("Descrição", { exact: true }).fill("Criado pelo e2e");
    await novo.getByRole("button", { name: "Criar", exact: true }).click();

    await expect(toast(page, "Papel criado.")).toBeVisible();
    const linha = page.getByRole("row").filter({ hasText: nome });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText("Criado pelo e2e");

    const criado = await buscarPorNome();
    expect(criado).toBeDefined();
    expect(criado).toMatchObject({ nome, descricao: "Criado pelo e2e" });
    const id = criado!.id;

    // ── Editar ──
    await linha.getByRole("button", { name: `Editar ${nome}`, exact: true }).click();
    const editar = page.getByRole("dialog", { name: "Editar papel" });
    await expect(editar.getByLabel("Nome", { exact: true })).toHaveValue(nome);
    await editar.getByLabel("Descrição", { exact: true }).fill("Editado pelo e2e");
    await editar.getByRole("button", { name: "Salvar", exact: true }).click();

    await expect(toast(page, "Papel atualizado.")).toBeVisible();
    await expect(linha).toContainText("Editado pelo e2e");

    const detalhe = await apiFetch(`/papeis/${id}`, {}, cookie);
    expect(detalhe.status).toBe(200);
    const { data: editado } = (await detalhe.json()) as Envelope<Papel & { permissoes: unknown[] }>;
    expect(editado).toMatchObject({ id, nome, descricao: "Editado pelo e2e", permissoes: [] });

    // ── Excluir (ConfirmacaoDialog) ──
    await linha.getByRole("button", { name: `Excluir ${nome}`, exact: true }).click();
    const confirmacao = page.getByRole("alertdialog");
    await expect(confirmacao).toContainText(nome);
    await confirmacao.getByRole("button", { name: "Excluir", exact: true }).click();

    await expect(toast(page, "Papel excluído.")).toBeVisible();
    await expect(linha).toHaveCount(0);

    // Soft delete: a leitura filtra deleted_at, então o id some da API.
    const apagado = await apiFetch(`/papeis/${id}`, {}, cookie);
    expect(apagado.status).toBe(404);
    expect(await buscarPorNome()).toBeUndefined();
  });

  test("edita as permissões de um papel pelo editor", async ({ page }) => {
    // Papel temporário criado pela API: o foco do teste é o editor, não o cadastro.
    const r = await apiFetch(
      "/papeis",
      { method: "POST", body: JSON.stringify({ nome, descricao: "Permissões pelo e2e" }) },
      cookie,
    );
    expect(r.status, "criar papel temporário").toBe(201);
    const { data: papel } = (await r.json()) as Envelope<Papel>;
    await page.reload();

    const linha = page.getByRole("row").filter({ hasText: nome });
    await expect(linha).toContainText("nenhuma");
    await linha.getByRole("button", { name: `Permissões de ${nome}`, exact: true }).click();

    const editor = page.getByRole("dialog", { name: `Permissões — ${nome}` });
    await editor.getByRole("button", { name: "Adicionar permissão" }).click();
    await editor.getByRole("combobox", { name: "Ação da permissão 1" }).selectOption("read");
    await editor.getByRole("textbox", { name: "Recurso da permissão 1" }).fill("HistoricoAlteracao");
    await editor.getByRole("button", { name: "Salvar permissões", exact: true }).click();

    await expect(toast(page, "Permissões atualizadas.")).toBeVisible();
    await expect(editor).toHaveCount(0);
    await expect(linha).toContainText("read HistoricoAlteracao");

    // UI → API: o conjunto gravado é exatamente o que foi montado na tela.
    const detalhe = await apiFetch(`/papeis/${papel.id}`, {}, cookie);
    expect(detalhe.status).toBe(200);
    const { data } = (await detalhe.json()) as Envelope<Papel & { permissoes: Permissao[] }>;
    expect(data.permissoes).toEqual([
      expect.objectContaining({ acao: "read", subject: "HistoricoAlteracao" }),
    ]);
  });
});
