import "dotenv/config";
import { env } from "./lib/env.ts"; // valida o .env na subida (fail fast) e configura o zod em pt-BR
import { createRequire } from "node:module";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

import { z } from "zod";
import router from "./routes/index.ts"; // monta os módulos de src/modules/index.ts (schemas inclusos)
import { auth } from "./lib/auth.ts";
import { pool } from "./db/index.ts";
import { createLogger } from "./lib/logger.ts";
import { clientIp, lerJson, type AppEnv } from "./lib/hono.ts";
import { authRateLimiter, globalRateLimiter, logsRateLimiter } from "./middlewares/rateLimit.ts";
import { registry } from "./lib/openapi/registry.ts";
import { ERROS, ok } from "./lib/openapi/helpers.ts";
import { errorResponse, successResponse } from "./lib/response.ts";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.ts";
import { requestLogger } from "./middlewares/requestLogger.ts";
import { auditContext } from "./middlewares/auditContext.ts";
import { traduzirRespostaAuth } from "./lib/authErros.ts";

const pkg = createRequire(import.meta.url)("../package.json") as {
  name: string;
  version: string;
  description?: string;
};

// A sessão do better-auth viaja em cookie httpOnly — é isto que o "cadeado"
// da documentação representa (`SEGURANCA` em lib/openapi/helpers.ts).
registry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "Cookie de sessão do better-auth (POST /auth/sign-in/email)",
});

const app = new Hono<AppEnv>();

// Headers de segurança (equivalente ao helmet). CORP liberado porque a API é
// consumida por outra origem (front) — inclusive <img> apontando para o proxy
// de download.
if (env.HELMET_ENABLED) {
  app.use(secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
}

const isDev = env.NODE_ENV !== "production";
// API_CORS em branco assume a origem de FRONTEND_URL (derivação em lib/envSchema.ts)
const allowedOrigins =
  env.API_CORS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

app.use(
  cors({
    origin: (origin) => {
      if (allowedOrigins.length > 0) return allowedOrigins.includes(origin) ? origin : null;
      return isDev ? origin : null;
    },
    credentials: true,
  }),
);

// CSRF (hono/csrf): barra POST/PATCH/PUT/DELETE "de formulário" (urlencoded,
// multipart, text/plain ou sem content-type) vindos de origem desconhecida —
// JSON não entra na checagem porque o navegador já exige preflight CORS.
// Entram API_CORS, TRUSTED_ORIGINS, FRONTEND_URL e a própria origem da API,
// então o painel funciona sem configuração extra e não existe modo "desligado".
const origemDe = (u?: string) => {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
};
const csrfOrigins = new Set<string>(
  [
    ...allowedOrigins,
    ...(env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
    origemDe(env.FRONTEND_URL),
    origemDe(env.BETTER_AUTH_URL),
    origemDe(env.API_URL),
  ].filter((o): o is string => Boolean(o)),
);
app.use(csrf({ origin: (origin) => csrfOrigins.has(origin) }));

// Contexto (AsyncLocalStorage) + log ANTES do better-auth: login falho também
// é logado, e o requestId já está no contexto para o getLogger()
app.use(auditContext);
app.use(requestLogger);

// Rate limit (RATE_LIMIT_ENABLED — ver src/middlewares/rateLimit.ts)
if (globalRateLimiter) app.use(globalRateLimiter);
// Anti brute force: só conta tentativas FALHAS
if (authRateLimiter) {
  for (const rota of ["sign-in", "sign-up", "forget-password", "request-password-reset", "reset-password"]) {
    app.use(`/auth/${rota}`, authRateLimiter);
    app.use(`/auth/${rota}/*`, authRateLimiter);
  }
}

// Better Auth (cookie de sessão, OAuth, admin) — responde tudo sob /auth/*.
// Erros conhecidos saem com `message` em pt-BR (lib/authErros.ts); `code` fica.
app.on(["GET", "POST"], "/auth/*", async (c) => traduzirRespostaAuth(await auth.handler(c.req.raw)));

// Corpo JSON até 1 MB. Uploads (multipart) ficam de fora: cada rota de upload
// define o próprio limite (ver src/lib/storage/upload.ts).
const jsonBodyLimit = bodyLimit({ maxSize: 1024 * 1024 });
app.use((c, next) => {
  const tipo = c.req.header("content-type")?.toLowerCase() ?? "";
  return tipo.startsWith("multipart/") ? next() : jsonBodyLimit(c, next);
});

// ─── Saúde ───────────────────────────────────────────────────────────────────

const TAG_SISTEMA = ["Sistema"];

registry.registerPath({
  method: "get",
  path: "/ping",
  tags: TAG_SISTEMA,
  summary: "Liveness — o processo está de pé (não toca o banco)",
  responses: { 200: ok(z.object({ status: z.literal("ok") })) },
});
app.get("/ping", (c) => c.json(successResponse({ status: "ok" })));

registry.registerPath({
  method: "get",
  path: "/health",
  tags: TAG_SISTEMA,
  summary: "Readiness — processo + banco (healthcheck do docker/orquestrador)",
  responses: {
    200: ok(z.object({ status: z.literal("ok"), db: z.literal("ok") })),
    503: {
      description: "Banco de dados indisponível",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(z.unknown()), meta: z.object({}), erros: z.array(z.string()) }),
        },
      },
    },
  },
});
app.get("/health", async (c) => {
  try {
    await pool.query("select 1");
    return c.json(successResponse({ status: "ok", db: "ok" }));
  } catch {
    return c.json(errorResponse("Banco de dados indisponível"), 503);
  }
});

// ─── Logs do frontend ────────────────────────────────────────────────────────
// Recebe os logs do cliente (lib/logger.ts do front) e os injeta no pino, que
// já fan-outa para arquivo/stdout/OpenObserve (stream "frontend"). Público —
// erros acontecem antes do login — por isso validado e com rate limit próprio.
// O `userId` NÃO vem do cliente: é lido da sessão (cookie), quando houver.

const frontendLogger = createLogger("frontend");

const FrontendLogsSchema = z.object({
  logs: z
    .array(
      z.object({
        level: z.enum(["debug", "info", "warn", "error"]),
        message: z.string().max(500),
        timestamp: z.string().max(40).optional(),
        url: z.string().max(500).optional(),
        component: z.string().max(120).optional(),
        context: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(20),
});

registry.registerPath({
  method: "post",
  path: "/logs",
  tags: TAG_SISTEMA,
  summary: "Receber logs do frontend (público; userId vem da sessão, se houver)",
  request: { body: { content: { "application/json": { schema: FrontendLogsSchema } } } },
  responses: { 202: ok(z.object({ recebidos: z.number().int() }), "Lote aceito"), ...ERROS.validacao },
});
if (logsRateLimiter) app.use("/logs", logsRateLimiter);
app.post("/logs", async (c) => {
  const parsed = FrontendLogsSchema.safeParse(await lerJson(c));
  if (!parsed.success) {
    return c.json(errorResponse("Payload de logs inválido"), 400);
  }
  const sessao = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const userId = sessao?.user.id;
  const ip = clientIp(c);
  const requestId = c.get("requestId");
  for (const log of parsed.data.logs) {
    const { level, message, ...resto } = log;
    frontendLogger[level]({ ...resto, userId, requestId, origem: "frontend", ip }, message);
  }
  return c.json(successResponse({ recebidos: parsed.data.logs.length }), 202);
});

// ─── Módulos ─────────────────────────────────────────────────────────────────

app.route("/", router);

// ─── OpenAPI / documentação ──────────────────────────────────────────────────
// Depois dos módulos: o registry já tem todos os paths. O spec é calculado uma
// vez (lazy) e cacheado — não muda em runtime.

const SCALAR_VERSION = "1.72.0"; // fixada: atualização da CDN nunca quebra o /docs sem querer

function gerarSpecModulos() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: pkg.name, version: pkg.version, description: pkg.description },
    servers: [{ url: env.API_URL ?? `http://localhost:${env.API_PORT}` }],
  });
}

type OperacaoAuth = { responses?: Record<string, unknown>; security?: unknown[] };
type SpecBetterAuth = {
  paths?: Record<string, { get?: OperacaoAuth; post?: OperacaoAuth }>;
  components?: { schemas?: Record<string, unknown> };
  tags?: { name: string; description: string }[];
};

/**
 * Funde o spec dos módulos com o do Better Auth (prefixado em /auth).
 * Inclui o workaround da referência circular que o Better Auth gera em
 * `POST /get-session` (copia a resposta 200 do GET, que serializa correto).
 * OpenAPI 3.1: o `type: ["object", "null"]` que o Better Auth emite é válido.
 */
async function montarSpec() {
  const openApiSpec = gerarSpecModulos();
  try {
    const betterAuthResponse = await auth.api.generateOpenAPISchema({ asResponse: true });
    const betterAuthSpec = (await betterAuthResponse.json()) as SpecBetterAuth;

    const getSessionPath = betterAuthSpec.paths?.["/get-session"];
    if (getSessionPath?.post?.responses) {
      const post200 = getSessionPath.post.responses["200"];
      if (typeof post200 === "string" && post200.startsWith("[Circular")) {
        getSessionPath.post.responses["200"] = structuredClone(
          getSessionPath.get?.responses?.["200"] ?? {
            description: "Current session",
            content: {
              "application/json": {
                schema: {
                  type: ["object", "null"],
                  properties: {
                    session: { $ref: "#/components/schemas/Session" },
                    user: { $ref: "#/components/schemas/User" },
                  },
                  required: ["session", "user"],
                },
              },
            },
          },
        );
      }
    }

    // Prefixa em /auth e troca os esquemas do Better Auth (bearerAuth/apiKeyCookie)
    // pelo nosso `sessionCookie` — um esquema só na documentação
    const prefixedAuthPaths = Object.fromEntries(
      Object.entries(betterAuthSpec.paths ?? {}).map(([path, item]) => {
        for (const op of Object.values(item)) {
          if (op && Array.isArray(op.security) && op.security.length > 0)
            op.security = [{ sessionCookie: [] }];
        }
        return [`/auth${path}`, item];
      }),
    );

    return {
      ...openApiSpec,
      paths: { ...openApiSpec.paths, ...prefixedAuthPaths },
      components: {
        ...openApiSpec.components,
        schemas: { ...openApiSpec.components?.schemas, ...(betterAuthSpec.components?.schemas ?? {}) },
        securitySchemes: openApiSpec.components?.securitySchemes,
      },
      tags: [...(openApiSpec.tags ?? []), ...(betterAuthSpec.tags ?? [])],
    };
  } catch {
    return openApiSpec;
  }
}

let specCache: Promise<Awaited<ReturnType<typeof montarSpec>>> | undefined;
export function getMergedSpec() {
  specCache ??= montarSpec();
  return specCache;
}

// DOCS_ENABLED=false (produção com API pública): /docs* cai no 404 do envelope
if (env.DOCS_ENABLED) {
  app.get("/docs", (c) => {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' https: 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; worker-src blob:; font-src 'self' https: data:;",
    );
    return c.html(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pkg.name} – Docs</title>
</head>
<body>
  <script
    id="api-reference"
    data-url="/docs/openapi.json"
    data-configuration='{"theme":"default"}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}"></script>
</body>
</html>`);
  });

  app.get("/docs/openapi.json", async (c) => c.json(await getMergedSpec()));

  app.get("/docs/json", async (c) => {
    c.header("Content-Disposition", 'attachment; filename="openapi.json"');
    return c.json(await getMergedSpec());
  });
}

app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
