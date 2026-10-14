/**
 * Ambiente dos testes de INTEGRAÇÃO (vitest --project integration).
 *
 * Este módulo NÃO importa nada de `src/` de propósito: ele é lido pelo
 * `vitest.config.ts` (para o `env` do worker) e pelo `globalSetup.ts` ANTES de
 * qualquer import da aplicação — `src/db/index.ts` cria o Pool na importação
 * lendo `DATABASE_URL`, então a variável precisa estar apontando para o banco
 * de teste antes disso.
 *
 * Os valores vêm do `.env` (carregado por `dotenv/config` no config/globalSetup)
 * com defaults para o CI, que não tem `.env`.
 */

/** Banco de teste — porta 5434 é o `db_test` do docker-compose.yml. */
export const DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ?? "postgresql://user_template:102030fs@localhost:5434/db_template_test";

/** Sobrescreve o essencial do `env.ts` para apontar o app ao banco de teste. */
export const ENV_INTEGRACAO: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: DATABASE_URL_TEST,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3080",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "segredo-somente-para-testes-de-integracao",
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
  TRUSTED_ORIGINS: process.env.TRUSTED_ORIGINS ?? "http://localhost:3000",
  API_CORS: process.env.API_CORS ?? "http://localhost:3000",
  // Logs da API não interessam na saída do vitest (LOG_LEVEL_TEST=info para depurar)
  LOG_LEVEL: process.env.LOG_LEVEL_TEST ?? "silent",
};

export function aplicarEnvDeTeste() {
  for (const [chave, valor] of Object.entries(ENV_INTEGRACAO)) process.env[chave] = valor;
}

/** Recusa rodar contra um banco cujo nome não contenha "test" — o setup TRUNCA tabelas. */
export function garantirBancoDeTeste(url: string) {
  const nome = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(nome)) {
    throw new Error(
      `DATABASE_URL_TEST aponta para "${nome}", que não parece um banco de teste (o nome precisa conter "test").`,
    );
  }
}
