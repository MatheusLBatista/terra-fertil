import type { MiddlewareHandler } from "hono";
import { auth } from "../lib/auth.ts";
import { errorResponse } from "../lib/response.ts";
import { getContext } from "../lib/requestContext.ts";
import { defineAbilityFor } from "../lib/casl/ability.ts";
import type { AppEnv } from "../lib/hono.ts";

/**
 * Valida a sessão do better-auth (cookie) e popula `user`, `session` e
 * `ability` no contexto do Hono — e o userId/ability no AsyncLocalStorage,
 * para as colunas de auditoria e checagens dentro dos services.
 * `getSession` lê o cookie de sessão e, com `cookieCache` ligado (lib/auth.ts),
 * o cookie assinado `session_data` — sem ida ao banco dentro do maxAge.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json(errorResponse("Não autenticado"), 401);
  }

  const user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? undefined,
    role: (session.user as { role?: string | null }).role ?? undefined,
  };
  const ability = await defineAbilityFor({ id: user.id, role: user.role });

  c.set("user", user);
  c.set("session", session.session);
  c.set("ability", ability);

  const ctx = getContext();
  if (ctx) {
    ctx.userId = user.id;
    ctx.role = user.role;
    ctx.ability = ability;
  }

  await next();
};

/** RBAC simples por papel — para quando o CASL for mais do que a rota precisa. */
export function requireRole(...roles: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userRole = c.get("user")?.role;
    if (!userRole || !roles.includes(userRole)) {
      return c.json(errorResponse("Acesso negado: permissão insuficiente"), 403);
    }
    await next();
  };
}
