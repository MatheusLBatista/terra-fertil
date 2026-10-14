import type { MiddlewareHandler } from "hono";
import { runWithContext } from "../lib/requestContext.ts";

/**
 * Estabelece um contexto de requisição (AsyncLocalStorage) para toda a cadeia
 * de handlers. Deve ser o PRIMEIRO middleware: o `requestLogger` grava o
 * `requestId` nele e o `requireAuth` popula `userId`/`role`/`ability` após
 * validar a sessão — assim as colunas de auditoria (created_by / updated_by)
 * e o `getLogger()` funcionam sem passar nada à mão pelas camadas.
 */
export const auditContext: MiddlewareHandler = (_c, next) => runWithContext({}, () => next());
