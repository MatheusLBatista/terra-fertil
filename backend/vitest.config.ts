import "dotenv/config";
import { configDefaults, defineConfig } from "vitest/config";
import { ENV_INTEGRACAO } from "./src/test/env.ts";

/**
 * Dois projetos:
 *
 * - `unit` (skill testes-unitarios): `*.test.ts` de service com o repository
 *   mockado — sem banco, sem HTTP, sem `.env`. `bun run test`.
 * - `integration` (skill testes-integracao): `*.integration.test.ts` contra o
 *   Postgres de teste (`db_test` do docker-compose.yml) via `app.request()`.
 *   O globalSetup aplica schema + trigger + seeds; o setup limpa os dados entre
 *   arquivos; os arquivos rodam em série (compartilham o banco).
 *   `bun run test:integration`. Os dois juntos: `bun run test:all`.
 */
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          globalSetup: ["src/test/globalSetup.ts"],
          setupFiles: ["src/test/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // Aponta o app para o banco de teste ANTES dos imports do arquivo
          env: ENV_INTEGRACAO,
        },
      },
    ],
  },
});
