import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../lib/appError.ts";
import { errorResponse } from "../lib/response.ts";
import logger from "../lib/logger.ts";
import type { AppEnv } from "../lib/hono.ts";

type Status = ContentfulStatusCode;

/** Erros do Postgres que viram resposta de negócio em vez de 500. */
const ERROS_POSTGRES: Record<string, { status: Status; mensagem: string }> = {
  "23505": { status: 409, mensagem: "Registro já existe" },
  "23503": { status: 409, mensagem: "Registro referenciado por outro" },
  "23514": { status: 422, mensagem: "Valor inválido" },
};

/**
 * Tratamento central de erros: tudo que escapa dos handlers vira o envelope
 * `{ data, meta, erros }` com o status certo. Regra de nível de log: 5xx =
 * error, 429 = warn, demais 4xx = info (são fluxo normal — validação, 404...).
 * Roda fora do AsyncLocalStorage da requisição, por isso o requestId vai à mão.
 */
export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const ctx = {
    requestId: c.get("requestId"),
    userId: c.get("user")?.id,
    method: c.req.method,
    url: c.req.path,
    err,
  };

  if (err instanceof AppError) {
    const nivel = err.statusCode >= 500 ? "error" : err.statusCode === 429 ? "warn" : "info";
    logger[nivel]({ ...ctx, status: err.statusCode }, err.message);
    const meta = err.codigo ? { codigo: err.codigo } : {};
    return c.json(errorResponse(err.message, err.data ?? [], meta), err.statusCode as Status);
  }

  // Erros do próprio Hono (bodyLimit 413, csrf 403, etc.)
  if (err instanceof HTTPException) {
    const status = err.status;
    const mensagem =
      status === 413
        ? "Corpo da requisição muito grande"
        : status === 403
          ? "Origem não permitida (CSRF)"
          : err.message || "Requisição inválida";
    logger[status >= 500 ? "error" : "info"]({ ...ctx, status }, mensagem);
    return c.json(errorResponse(mensagem), status);
  }

  // Violações de constraint do Postgres (unique, FK, check) → 409/422 em vez de 500
  const cause = (err as { cause?: { code?: string } }).cause;
  const pg = cause?.code ? ERROS_POSTGRES[cause.code] : undefined;
  if (pg) {
    logger.info({ ...ctx, status: pg.status, pgCode: cause?.code }, pg.mensagem);
    return c.json(errorResponse(pg.mensagem), pg.status);
  }

  logger.error(ctx, "Erro interno do servidor");
  return c.json(errorResponse("Erro interno do servidor"), 500);
};

/**
 * Rota inexistente: sem isto o Hono responde "404 Not Found" em texto puro,
 * quebrando o contrato `{ data, meta, erros }` — o cliente faz `response.json()`
 * e recebe texto.
 */
export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(errorResponse(`Rota não encontrada: ${c.req.method} ${c.req.path}`), 404);
