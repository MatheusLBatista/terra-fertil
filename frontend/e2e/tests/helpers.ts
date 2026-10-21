import { test as base, expect, type Page } from "@playwright/test";
import { config as dotenv } from "dotenv";
import path from "node:path";

// Mesmas URLs do playwright.config.ts (NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_API_URL do .env.local).
dotenv({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3080";

/**
 * Admin do seed (`backend/src/seeds/usuarios.ts`). Se o `backend/.env` define
 * ADMIN_EMAIL/ADMIN_PASSWORD, o seed usa esses — passe os mesmos em
 * E2E_ADMIN_EMAIL/E2E_ADMIN_SENHA (o e2e não lê o .env do backend).
 */
export const SENHA_PADRAO = "102030fs";
export const ADMIN = process.env.E2E_ADMIN_EMAIL || "fslab.vilhena@ifro.edu.br";
export const ADMIN_SENHA = process.env.E2E_ADMIN_SENHA || SENHA_PADRAO;
/** Senha das contas temporárias criadas pelos testes. */
export const SENHA_TEMPORARIA = SENHA_PADRAO;

/** Senha padrão de quem não informou: a do admin para o admin, a temporária para os outros. */
const senhaDe = (email: string) => (email === ADMIN ? ADMIN_SENHA : SENHA_TEMPORARIA);

/**
 * `test` dos e2e: igual ao do Playwright, mas esconde o `<nextjs-portal>` (botão
 * flutuante do Next Dev Tools, canto inferior direito) — em dev ele fica por cima
 * do rodapé dos sheets e intercepta o clique em "Criar"/"Salvar".
 */
export const test = base.extend({
  page: async ({ page }, usar) => {
    await page.addInitScript(() => {
      const esconder = () => {
        const estilo = document.createElement("style");
        estilo.textContent = "nextjs-portal { display: none !important; }";
        (document.head ?? document.documentElement).appendChild(estilo);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", esconder);
      else esconder();
    });
    await usar(page);
  },
});

/** Envelope da API — toda resposta é `{ data, meta, erros }`. */
export type Envelope<T> = { data: T; meta: Record<string, unknown>; erros: string[] };

/**
 * Login PELA TELA (/login): preenche o formulário, envia e espera o redirect
 * para /dashboard. É o caminho do usuário — use nos testes.
 */
export async function login(page: Page, email = ADMIN, senha = senhaDe(email)) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/**
 * Login direto na API: devolve o cookie de sessão (`better-auth.session_token=…`)
 * pronto para o header `Cookie`. Só para preparar/limpar dados (setup/teardown)
 * e conferir o estado no servidor — nunca substitui o `login()` pela tela.
 */
export async function apiLogin(email = ADMIN, senha = senhaDe(email)): Promise<string> {
  const r = await fetch(`${API_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: APP_URL },
    body: JSON.stringify({ email, password: senha }),
  });
  const m = (r.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=[^;]+/);
  if (!m)
    throw new Error(`Login na API falhou (${r.status}) para ${email}. A API está no ar e o banco semeado?`);
  return m[0];
}

/** `fetch` autenticado contra a API (setup/teardown e asserções de estado). */
export function apiFetch(path: string, init: RequestInit = {}, cookie: string) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: APP_URL,
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });
}

/** Usuário do plugin admin do better-auth (o que `/auth/admin/*` devolve). */
export type UsuarioApi = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
};

/**
 * Conta temporária com o papel dado, criada pela API do admin — o teste não
 * depende do estado das contas demo do seed (podem ter sido banidas ou
 * alteradas na tela). Remova no fim com `removerUsuario`.
 */
export async function criarUsuario(
  admin: string,
  { email, papel, nome = "Usuário E2E" }: { email: string; papel: string; nome?: string },
): Promise<UsuarioApi> {
  const r = await apiFetch(
    "/auth/admin/create-user",
    {
      method: "POST",
      body: JSON.stringify({ email, password: SENHA_TEMPORARIA, name: nome, role: papel }),
    },
    admin,
  );
  expect(r.status, `criar usuário temporário ${email}`).toBe(200);
  return ((await r.json()) as { user: UsuarioApi }).user;
}

/** Usuário pelo e-mail (busca exata do plugin admin) — `undefined` se não existe. */
export async function buscarUsuario(admin: string, email: string): Promise<UsuarioApi | undefined> {
  const q = new URLSearchParams({ searchValue: email, searchField: "email", searchOperator: "contains" });
  const r = await apiFetch(`/auth/admin/list-users?${q}`, {}, admin);
  expect(r.status, "listar usuários").toBe(200);
  const { users } = (await r.json()) as { users: UsuarioApi[] };
  return users.find((u) => u.email === email);
}

/** Remove a conta pelo e-mail, se ainda existir (limpeza em afterEach/afterAll). */
export async function removerUsuario(admin: string, email: string) {
  const sobra = await buscarUsuario(admin, email);
  if (sobra) {
    await apiFetch(
      "/auth/admin/remove-user",
      { method: "POST", body: JSON.stringify({ userId: sobra.id }) },
      admin,
    );
  }
}

/**
 * Nome único por execução (slug minúsculo — serve para `papeis.nome`): timestamp
 * base36 + 3 caracteres aleatórios, para duas chamadas no mesmo milissegundo não colidirem.
 */
export const nomeUnico = (prefixo: string) =>
  `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** E-mail único por execução, no domínio reservado `example.com`. */
export const emailUnico = (prefixo: string) => `${nomeUnico(prefixo)}@example.com`;

/** Menu lateral (landmark `navigation "Menu principal"`) — os itens que o papel vê. */
export const menu = (page: Page) => page.getByRole("navigation", { name: "Menu principal" });

/** Toast do react-toastify (role="alert") com o texto dado. */
export const toast = (page: Page, texto: string) => page.getByRole("alert").filter({ hasText: texto });

/**
 * Confere o toast e o dispensa (`closeOnClick`). Use quando o próximo clique é na
 * coluna Ações: o toast (canto superior direito) cobre as primeiras linhas da
 * tabela e o Playwright esperaria ele sumir sozinho (~5s) para clicar.
 */
export async function verEDispensarToast(page: Page, texto: string) {
  const aviso = toast(page, texto);
  await expect(aviso).toBeVisible();
  await aviso.click();
  await expect(aviso).toHaveCount(0);
}
