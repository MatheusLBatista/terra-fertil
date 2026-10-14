import { test as base, expect, type Page } from "@playwright/test";
import { config as dotenv } from "dotenv";
import path from "node:path";

// Mesmas URLs do playwright.config.ts (NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_API_URL do .env.local).
dotenv({ path: path.join(__dirname, "..", "..", ".env.local"), quiet: true });

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3080";

/** Usuários do seed (`backend/src/seeds/usuarios.ts`). */
export const SENHA_PADRAO = "102030fs";
export const ADMIN = "admin@example.com";
export const GESTOR = "gestor@example.com";
export const USUARIO = "usuario@example.com";

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
export async function login(page: Page, email = ADMIN, senha = SENHA_PADRAO) {
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
export async function apiLogin(email = ADMIN, senha = SENHA_PADRAO): Promise<string> {
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

/** Nome único por execução (slug minúsculo — serve para `papeis.nome`). */
export const nomeUnico = (prefixo: string) => `${prefixo}-${Date.now().toString(36)}`;

/** Menu lateral (landmark `navigation "Menu principal"`) — os itens que o papel vê. */
export const menu = (page: Page) => page.getByRole("navigation", { name: "Menu principal" });

/** Toast do react-toastify (role="alert") com o texto dado. */
export const toast = (page: Page, texto: string) => page.getByRole("alert").filter({ hasText: texto });
