import { Hono, type Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { AppAbility } from "./casl/ability.ts";
import type { auth } from "./auth.ts";
import { env } from "./env.ts";
import { AppError } from "./appError.ts";

type SessionData = typeof auth.$Infer.Session;

/**
 * Tipagem do contexto do Hono compartilhada por toda a API.
 *
 * `c.get("user")`, `c.get("ability")` etc. são populados pelo `requireAuth`;
 * `requestId` pelo `requestLogger`. Todo router de módulo é criado com
 * `createRouter()` para herdar estes tipos.
 */
export type AppEnv = {
  Variables: {
    /** Usuário autenticado. Populado por requireAuth(). */
    user?: { id: string; email: string; name?: string; role?: string };
    /** Sessão do better-auth. Populada por requireAuth(). */
    session?: SessionData["session"];
    /** Habilidades CASL do usuário autenticado. Populada por requireAuth(). */
    ability?: AppAbility;
    /** Id da requisição (header x-request-id), para correlação nos logs. */
    requestId: string;
  };
};

export type AppContext = Context<AppEnv>;

/** Router de módulo já tipado com o `AppEnv`. */
export const createRouter = () => new Hono<AppEnv>();

/**
 * IP do cliente. Atrás de reverse proxy, `TRUST_PROXY=<hops>` faz o IP vir do
 * X-Forwarded-For (o N-ésimo a partir do fim, como no Express); sem isso usa
 * o endereço do socket — essencial para o rate limit não punir o proxy.
 */
export function clientIp(c: Context): string {
  const trust = env.TRUST_PROXY;
  if (trust && trust !== "false") {
    const hops = Number(trust);
    const forwarded =
      c.req
        .header("x-forwarded-for")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    if (forwarded.length > 0) {
      const idx = Number.isNaN(hops) || hops < 1 ? 0 : Math.max(0, forwarded.length - hops);
      return forwarded[idx] ?? forwarded[0];
    }
  }
  try {
    return getConnInfo(c).remote.address ?? "";
  } catch {
    return "";
  }
}

const METODOS_COM_CORPO = new Set(["POST", "PATCH", "PUT"]);

/**
 * Corpo JSON da requisição. JSON inválido vira `AppError` 400; POST/PATCH/PUT
 * com corpo que não é `application/json` vira 415 — mantém o envelope
 * `{ data, meta, erros }`. Sem corpo (ou GET/DELETE) devolve `{}`.
 */
export async function lerJson(c: Context): Promise<unknown> {
  const tipo = c.req.header("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    const temCorpo =
      Number(c.req.header("content-length") ?? 0) > 0 || Boolean(c.req.header("transfer-encoding"));
    if (METODOS_COM_CORPO.has(c.req.method) && temCorpo) {
      throw new AppError("Corpo da requisição precisa ser application/json", 415);
    }
    return {};
  }
  try {
    return await c.req.json();
  } catch {
    throw new AppError("Corpo da requisição não é um JSON válido", 400);
  }
}
