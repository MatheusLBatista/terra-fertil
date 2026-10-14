import type { MiddlewareHandler } from "hono";
import { errorResponse } from "../lib/response.ts";
import type { Action, Subject } from "../lib/casl/ability.ts";
import type { AppEnv } from "../lib/hono.ts";

/**
 * Autorização via CASL. Use SEMPRE depois do `requireAuth`, que popula
 * `ability` no contexto a partir do papel do usuário:
 *
 *   router.post("/", requireAuth, requirePermission("create", "Fornecedor"), controller.inserir);
 *
 * Para checagens por instância (ex.: só o dono edita), faça no service com
 * `ability.can("update", subject("Fornecedor", registro))`.
 */
export function requirePermission(action: Action, subjectName: Subject): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ability = c.get("ability");
    if (!ability) {
      return c.json(errorResponse("Não autenticado"), 401);
    }
    if (!ability.can(action, subjectName)) {
      return c.json(errorResponse("Acesso negado: permissão insuficiente"), 403);
    }
    await next();
  };
}
