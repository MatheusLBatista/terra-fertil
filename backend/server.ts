import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./src/app.ts";
import { env } from "./src/lib/env.ts";
import logger, { flushLogs } from "./src/lib/logger.ts";
import { pool } from "./src/db/index.ts";

const port = env.API_PORT;

const server = serve({ fetch: app.fetch, port }, () => {
  logger.info(
    `API rodando na porta ${port}${env.DOCS_ENABLED ? ` — docs em http://localhost:${port}/docs` : ""}`,
  );
});

/**
 * Graceful shutdown: para de aceitar conexões novas, espera as requests em
 * andamento terminarem, fecha o pool do Postgres, envia os logs pendentes ao
 * OpenObserve e sai. Se algo travar, força a saída em 10s. Essencial em
 * produção (docker stop envia SIGTERM).
 */
let encerrando = false;
function encerrar(sinal: string, codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  logger.info(`${sinal} recebido — encerrando com graça...`);

  const forcar = setTimeout(() => {
    logger.error("Encerramento excedeu 10s — saída forçada");
    process.exit(1);
  }, 10_000);
  forcar.unref();

  server.close(() => {
    pool
      .end()
      .then(() => {
        logger.info("Conexões encerradas. Até logo.");
        return flushLogs();
      })
      .then(() => process.exit(codigo))
      .catch((err) => {
        logger.error({ err }, "Falha ao fechar o pool do banco");
        process.exit(1);
      });
  });
}

process.on("SIGTERM", () => encerrar("SIGTERM"));
process.on("SIGINT", () => encerrar("SIGINT"));

// Erro não tratado = estado desconhecido: loga, tenta encerrar com graça e sai
// com 1 (o docker/orquestrador reinicia o container). Promise rejeitada sem
// catch é só logada — o handler de erro do Hono já cobre as requests.
process.on("unhandledRejection", (motivo) => {
  logger.error({ err: motivo }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException — encerrando");
  encerrar("uncaughtException", 1);
});
