import { defineConfig } from "@playwright/test";
import { config as dotenv } from "dotenv";
import path from "node:path";

// As URLs vêm do .env.local deste app (NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_API_URL).
dotenv({ path: path.join(__dirname, ".env.local"), quiet: true });

/**
 * Playwright do painel — dois projetos, rodados de dentro de `frontend/`:
 *
 * - `ui-verify` (`npm run ui:verify`, skill `ui-verify`): prints por breakpoint,
 *   overflow horizontal e axe. Não é suíte de testes.
 * - `e2e` (`npm run e2e`, skill `teste-e2e`): testes ponta a ponta de verdade,
 *   em `e2e/tests/*.e2e.ts` — UI → API → banco.
 *
 * Usa o Google Chrome instalado (`channel: "chrome"`) — não baixa browser.
 * API (3080) e front (3000) precisam estar no ar, com o banco de dev semeado.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./e2e/.resultados",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    channel: "chrome",
    headless: true,
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: "ui-verify",
      testMatch: /ui-verify\.spec\.ts/,
      timeout: 120_000,
    },
    {
      name: "e2e",
      testDir: "./e2e/tests",
      testMatch: /.*\.e2e\.ts/,
      timeout: 60_000,
      use: {
        viewport: { width: 1280, height: 800 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "off",
      },
    },
  ],
});
