import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Verificação visual de telas (skill `ui-verify`):
 *
 * 1. Loga na API (cookie de sessão do better-auth) com o usuário admin.
 * 2. Para cada rota × breakpoint do Tailwind: abre a tela, tira o print em
 *    `e2e/prints/<rota>-<largura>.png`, checa overflow horizontal e roda o
 *    axe (WCAG 2 A/AA).
 * 3. Falha se houver overflow ou violação de impacto serious/critical; as
 *    demais violações saem como aviso no relatório.
 *
 * Variáveis (todas opcionais):
 *   ROTAS=/municipios,/usuarios   telas a verificar (default: ROTAS_PADRAO — menu + telas públicas)
 *   TEMA=light|dark               tema (default: dark, o padrão do painel)
 *   LARGURAS=375,1440             breakpoints (default: 375,768,1024,1440)
 *   UI_VERIFY_EMAIL / UI_VERIFY_SENHA  credenciais (default: admin do seed; se o backend/.env
 *                                 define ADMIN_EMAIL/ADMIN_PASSWORD, passe-os aqui — o spec
 *                                 não lê o .env do backend)
 *   CHECAR=tudo|prints|axe        tudo (default) = prints + overflow + axe;
 *                                 prints = só prints + overflow (pula o axe);
 *                                 axe = overflow + axe (não tira prints)
 */

// URLs do .env.local do front (o playwright.config.ts carrega).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3080";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const EMAIL = process.env.UI_VERIFY_EMAIL ?? "fslab.vilhena@ifro.edu.br";
const SENHA = process.env.UI_VERIFY_SENHA ?? "102030fs";
const TEMA = process.env.TEMA ?? "dark";
const CHECAR = (process.env.CHECAR || "tudo") as "tudo" | "prints" | "axe";
if (!["tudo", "prints", "axe"].includes(CHECAR)) {
  throw new Error(`CHECAR inválido: "${CHECAR}" (use tudo, prints ou axe)`);
}
const TIRAR_PRINTS = CHECAR !== "axe";
const RODAR_AXE = CHECAR !== "prints";

// Telas públicas: abertas sem cookie de sessão (o proxy as deixa passar).
// /registrar só existe com NEXT_PUBLIC_SIGNUP_ENABLED=true (senão redireciona ao login).
const ROTAS_PUBLICAS = new Set(["/login", "/registrar", "/recuperar-senha", "/definir-senha"]);
const SIGNUP = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";

const ROTAS_PADRAO = [
  "/login",
  "/recuperar-senha",
  "/definir-senha", // sem ?token= mostra "Link inválido" — o estado que abre sem e-mail
  ...(SIGNUP ? ["/registrar"] : []),
  "/dashboard",
  "/estados",
  "/municipios",
  "/historico",
  "/usuarios",
  "/papeis",
];
const ROTAS = (process.env.ROTAS ?? ROTAS_PADRAO.join(","))
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

// Breakpoints do Tailwind: sm (640) fica coberto por 375 e 768; xl = 1280 e 2xl = 1536 raramente mudam layout.
const LARGURAS = (process.env.LARGURAS ?? "375,768,1024,1440")
  .split(",")
  .map((l) => Number(l.trim()))
  .filter((l) => Number.isInteger(l) && l > 0);

const PASTA_PRINTS = path.join(__dirname, "prints");

async function cookieDeSessao(): Promise<string> {
  const r = await fetch(`${API_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: APP_URL,
    },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  });
  const m = (r.headers.get("set-cookie") ?? "").match(/better-auth\.session_token=([^;]+)/);
  if (!m)
    throw new Error(
      `Login falhou na API (${r.status}). Suba a API e confira UI_VERIFY_EMAIL/UI_VERIFY_SENHA.`,
    );
  return decodeURIComponent(m[1]);
}

/** Elementos que vazam para fora da largura da janela (os 5 primeiros, para o relatório). */
async function elementosComOverflow(page: Page) {
  return page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const vazando: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > largura + 1) {
        const id = el.id ? `#${el.id}` : "";
        const cls =
          el.className && typeof el.className === "string"
            ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
            : "";
        vazando.push(`${el.tagName.toLowerCase()}${id}${cls} (right=${Math.round(r.right)}px)`);
        if (vazando.length >= 5) break;
      }
    }
    const scroll = document.documentElement.scrollWidth;
    return { largura, scroll, temOverflow: scroll > largura, vazando };
  });
}

const nomeArquivo = (rota: string, largura: number) =>
  `${rota === "/" ? "raiz" : rota.replace(/^\//, "").replace(/[^a-z0-9-]+/gi, "_")}-${largura}.png`;

test.beforeAll(() => {
  if (TIRAR_PRINTS) mkdirSync(PASTA_PRINTS, { recursive: true });
});

for (const rota of ROTAS) {
  test.describe(rota, () => {
    for (const largura of LARGURAS) {
      test(`${largura}px`, async ({ browser }, testInfo) => {
        const context = await browser.newContext({
          viewport: { width: largura, height: largura < 768 ? 812 : 900 },
          colorScheme: TEMA === "light" ? "light" : "dark",
        });
        await context.addInitScript((tema) => localStorage.setItem("theme", tema), TEMA);
        // Cookie de sessão no host do painel (NEXT_PUBLIC_APP_URL): o Playwright deriva
        // domínio, caminho e `secure` da URL — vale para localhost e para um host de staging.
        if (!ROTAS_PUBLICAS.has(rota.split("?")[0])) {
          await context.addCookies([
            { name: "better-auth.session_token", value: await cookieDeSessao(), url: APP_URL },
          ]);
        }

        const page = await context.newPage();
        await page.goto(rota, { waitUntil: "networkidle" });
        await page.waitForTimeout(500); // animações do sidebar/toasts

        const print = path.join(PASTA_PRINTS, nomeArquivo(rota, largura));
        if (TIRAR_PRINTS) {
          await page.screenshot({ path: print, fullPage: true });
          testInfo.attachments.push({ name: "print", path: print, contentType: "image/png" });
        }

        const overflow = await elementosComOverflow(page);
        const violacoes = RODAR_AXE
          ? (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations
          : [];
        const graves = violacoes.filter((v) => v.impact === "serious" || v.impact === "critical");
        const leves = violacoes.filter((v) => !graves.includes(v));

        const linhas = [
          TIRAR_PRINTS ? `print: ${path.relative(process.cwd(), print)}` : "print: (pulado, CHECAR=axe)",
          overflow.temOverflow
            ? `OVERFLOW: scrollWidth ${overflow.scroll} > viewport ${overflow.largura}\n  ${overflow.vazando.join("\n  ")}`
            : "overflow: ok",
          ...graves.map(
            (v) =>
              `AXE ${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} nó(s))\n  ${v.nodes
                .slice(0, 3)
                .map((n) => n.target.join(" "))
                .join("\n  ")}`,
          ),
          ...leves.map((v) => `axe ${v.impact ?? "minor"}: ${v.id} — ${v.help} (${v.nodes.length} nó(s))`),
          ...(RODAR_AXE ? [] : ["axe: (pulado, CHECAR=prints)"]),
        ];
        console.log(`\n[${rota} @ ${largura}px]\n${linhas.join("\n")}`);

        await context.close();

        expect(overflow.temOverflow, `Overflow horizontal em ${rota} @ ${largura}px`).toBe(false);
        expect(graves, `Violações graves do axe em ${rota} @ ${largura}px`).toEqual([]);
      });
    }
  });
}
