import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import logger from "../lib/logger.ts";
import { getContext } from "../lib/requestContext.ts";
import { clientIp, type AppEnv } from "../lib/hono.ts";

// Só aceitamos UUID vindo do cliente — qualquer outra coisa é descartada
// (evita injetar texto arbitrário/forjar correlação nos logs)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Loga toda requisição ao terminar, com `x-request-id` (UUID gerado ou vindo do
 * cliente) para correlação — também gravado no AsyncLocalStorage, de onde
 * `getLogger()` o lê. Nível por status: 5xx = error, 429 = warn e o resto =
 * info — 4xx é conversa normal de API (401 deslogado, 404 de bot, 400 de
 * payload) e como warn só enche o OpenObserve de ruído.
 */
export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const inicio = process.hrtime.bigint();
  const recebido = c.req.header("x-request-id");
  const requestId = recebido && UUID.test(recebido) ? recebido.toLowerCase() : randomUUID();
  c.set("requestId", requestId);
  const ctx = getContext();
  if (ctx) ctx.requestId = requestId;

  await next();

  const status = c.res.status;
  const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;
  const nivel = status >= 500 ? "error" : status === 429 ? "warn" : "info";
  const { method, path } = c.req;

  c.res.headers.set("x-request-id", requestId);

  logger[nivel](
    {
      requestId,
      method,
      url: path,
      status,
      duracaoMs: Math.round(duracaoMs),
      userId: c.get("user")?.id,
      ip: clientIp(c),
      userAgent: c.req.header("user-agent"),
    },
    `${method} ${path} ${status}`,
  );
};
