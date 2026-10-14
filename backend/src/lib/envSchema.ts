import { z } from "zod";

/**
 * Schema do `.env` — PURO (não lê `process.env`, não tem efeito colateral),
 * para o `env.ts` validar na subida e o `scripts/envCheck.ts` reaproveitar
 * (chaves obrigatórias = as que falham ao validar `{}`).
 *
 * Convenção: integrações opcionais (OpenObserve, Garage, FS-Mail, OAuth Google)
 * podem ficar EM BRANCO — string vazia vira `undefined` e o recurso fica
 * desligado. Cada integração é tudo-ou-nada: preencher só metade das variáveis
 * é erro. Só o essencial (banco, auth, front) é obrigatório.
 *
 * Derivações (valor explícito sempre vence):
 * - DATABASE_URL em branco + POSTGRES_USER/PASSWORD/DB → monta a URL (localhost:POSTGRES_PORT)
 * - BETTER_AUTH_URL ↔ API_URL: um em branco assume o outro
 * - TRUSTED_ORIGINS e API_CORS em branco → origem de FRONTEND_URL
 */

const vazio = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** String opcional — em branco no .env significa "recurso desligado". */
const opcional = z.preprocess(vazio, z.string().optional());

/** URL opcional (validada quando preenchida). */
const urlOpcional = z.preprocess(vazio, z.url().optional());

/** Booleano via string "true"/"false" (em branco usa o default). */
const flag = (def: "true" | "false") =>
  z.preprocess(vazio, z.enum(["true", "false"]).default(def)).transform((v) => v === "true");

/** Inteiro >= 0 (em branco usa o default). */
const inteiro = (def: number) => z.preprocess(vazio, z.coerce.number().int().min(0).default(def));

/** Senha das contas de demonstração (seed) — proibida em produção. */
export const SENHA_DEMO = "102030fs";

const origemDe = (u?: string) => {
  try {
    return u ? new URL(u).origin : undefined;
  } catch {
    return undefined;
  }
};

export const EnvSchema = z
  .object({
    NODE_ENV: z.preprocess(vazio, z.enum(["development", "test", "production"]).default("development")),
    LOG_LEVEL: z.preprocess(
      vazio,
      z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    ),
    /** Grava também em logs/<nome>.log (em dev é sempre ligado; em produção só com true). */
    LOG_FILE: flag("false"),

    // ── API ──────────────────────────────────────────────────────────────────
    API_PORT: inteiro(3080),
    API_URL: urlOpcional,
    API_CORS: opcional,
    /** Documentação em /docs (Scalar). Desligue em produção se a API for pública. */
    DOCS_ENABLED: flag("true"),

    // ── Banco ────────────────────────────────────────────────────────────────
    DATABASE_URL: urlOpcional,
    POSTGRES_USER: opcional,
    /** O compose lê; aqui serve para montar DATABASE_URL e barrar a senha de exemplo em produção. */
    POSTGRES_PASSWORD: opcional,
    POSTGRES_DB: opcional,
    POSTGRES_PORT: inteiro(5432),
    /** `migrate` (default) aplica drizzle/; `push` sincroniza direto do model (sem histórico). */
    DB_SCHEMA_MODE: z.preprocess(vazio, z.enum(["migrate", "push"]).default("migrate")),
    /** Conexões máximas do pool do Postgres. */
    DB_POOL_MAX: inteiro(10),
    /** Tempo máximo de uma query (ms); 0 desliga. */
    DB_STATEMENT_TIMEOUT_MS: inteiro(30_000),

    // ── Auth ─────────────────────────────────────────────────────────────────
    BETTER_AUTH_URL: urlOpcional,
    BETTER_AUTH_SECRET: z.string({ error: "obrigatória" }).min(16, "precisa de ao menos 16 caracteres"),
    TRUSTED_ORIGINS: opcional,
    COOKIE_DOMAIN: opcional,
    FRONTEND_URL: z.url({ error: "obrigatória (usada nos e-mails de reset de senha e no CORS)" }),
    /** Cadastro público (POST /auth/sign-up e primeiro login social). Default: desligado. */
    AUTH_SIGNUP_ENABLED: flag("false"),
    GOOGLE_CLIENT_ID: opcional,
    GOOGLE_CLIENT_SECRET: opcional,

    // ── Admin inicial (seed de usuários) ─────────────────────────────────────
    /** Conta admin criada pelo seed; em produção o seed exige os três. */
    ADMIN_EMAIL: z.preprocess(vazio, z.email().optional()),
    ADMIN_PASSWORD: opcional,
    ADMIN_NAME: opcional,

    // ── Segurança HTTP ───────────────────────────────────────────────────────
    HELMET_ENABLED: flag("true"),
    /** Atrás de reverse proxy, número de hops (ex.: 1) para o IP real chegar ao rate limit. */
    TRUST_PROXY: opcional,
    /** Liga/desliga TODOS os limiters (auth, global, logs). Default: desligado. */
    RATE_LIMIT_ENABLED: flag("false"),
    RATE_LIMIT_JANELA_MIN: inteiro(15),
    /** Máximo de TENTATIVAS FALHAS de login/cadastro/reset por IP na janela (0 desliga). */
    RATE_LIMIT_AUTH_MAX: inteiro(20),
    /** Limite global de requests por IP na janela (0 = desligado, o default). */
    RATE_LIMIT_GLOBAL_MAX: inteiro(0),

    // ── Integrações opcionais (em branco = desligadas; tudo-ou-nada) ─────────
    OPENOBSERVE_URL: urlOpcional,
    OPENOBSERVE_TOKEN: opcional,
    OPENOBSERVE_ORG: z.preprocess(vazio, z.string().default("default")),
    OBJECTS_ENDPOINT: urlOpcional,
    OBJECTS_BUCKET_NAME: opcional,
    OBJECTS_PUBLIC_URL: urlOpcional,
    OBJECTS_ACCESS_KEY_ID: opcional,
    OBJECTS_SECRET_ACCESS_KEY: opcional,
    OBJECTS_REGION: z.preprocess(vazio, z.string().default("garage")),
    GARAGE_URL: urlOpcional,
    GARAGE_ADMIN_KEY: opcional,
    FSMAIL_URL: urlOpcional,
    FSMAIL_API_KEY: opcional,
    FSMAIL_FROM: z.preprocess(vazio, z.email().optional()),
  })
  // Derivações — valor explícito sempre vence
  .transform((cfg, ctx) => {
    const origemFront = origemDe(cfg.FRONTEND_URL);

    let DATABASE_URL = cfg.DATABASE_URL;
    if (!DATABASE_URL && cfg.POSTGRES_USER && cfg.POSTGRES_PASSWORD && cfg.POSTGRES_DB) {
      const u = encodeURIComponent(cfg.POSTGRES_USER);
      const p = encodeURIComponent(cfg.POSTGRES_PASSWORD);
      DATABASE_URL = `postgresql://${u}:${p}@localhost:${cfg.POSTGRES_PORT}/${cfg.POSTGRES_DB}`;
    }
    if (!DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "obrigatória (postgresql://...) — ou POSTGRES_USER/PASSWORD/DB para montar",
      });
    }

    const BETTER_AUTH_URL = cfg.BETTER_AUTH_URL ?? cfg.API_URL;
    const API_URL = cfg.API_URL ?? cfg.BETTER_AUTH_URL;
    if (!BETTER_AUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "obrigatória (URL pública da API) — ou API_URL",
      });
    }

    return {
      ...cfg,
      DATABASE_URL: DATABASE_URL as string,
      BETTER_AUTH_URL: BETTER_AUTH_URL as string,
      API_URL,
      TRUSTED_ORIGINS: cfg.TRUSTED_ORIGINS ?? origemFront,
      API_CORS: cfg.API_CORS ?? origemFront,
    };
  })
  .superRefine((cfg, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    // Integrações tudo-ou-nada: ou todas as variáveis do grupo, ou nenhuma.
    const grupos: [string, string[]][] = [
      ["OpenObserve", ["OPENOBSERVE_URL", "OPENOBSERVE_TOKEN"]],
      [
        "Garage (S3)",
        ["OBJECTS_ENDPOINT", "OBJECTS_BUCKET_NAME", "OBJECTS_ACCESS_KEY_ID", "OBJECTS_SECRET_ACCESS_KEY"],
      ],
      ["Garage (Admin API)", ["GARAGE_URL", "GARAGE_ADMIN_KEY"]],
      ["FS-Mail", ["FSMAIL_URL", "FSMAIL_API_KEY"]],
      ["OAuth Google", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]],
    ];
    const valores = cfg as Record<string, unknown>;
    for (const [nome, chaves] of grupos) {
      const definidas = chaves.filter((k) => valores[k] !== undefined);
      if (definidas.length > 0 && definidas.length < chaves.length) {
        for (const k of chaves.filter((k) => valores[k] === undefined)) {
          issue(k, `${nome}: defina ${chaves.join(", ")} juntas (ou deixe todas em branco)`);
        }
      }
    }

    if (cfg.NODE_ENV !== "production") return;

    if (/troque|xpto|changeme|secret/i.test(cfg.BETTER_AUTH_SECRET)) {
      issue(
        "BETTER_AUTH_SECRET",
        "valor de exemplo em produção — gere um segredo real (openssl rand -hex 32)",
      );
    }
    if (cfg.POSTGRES_PASSWORD === SENHA_DEMO || cfg.DATABASE_URL?.includes(`:${SENHA_DEMO}@`)) {
      issue("POSTGRES_PASSWORD", "senha de exemplo em produção — troque a senha do banco");
    }
    if (cfg.ADMIN_PASSWORD === SENHA_DEMO) {
      issue("ADMIN_PASSWORD", "senha de demonstração em produção — defina uma senha real");
    }
    const credenciais = [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "OBJECTS_ACCESS_KEY_ID",
      "OBJECTS_SECRET_ACCESS_KEY",
      "GARAGE_ADMIN_KEY",
      "FSMAIL_API_KEY",
      "OPENOBSERVE_TOKEN",
    ];
    for (const k of credenciais) {
      if (/^xpto$/i.test(String(valores[k] ?? ""))) {
        issue(k, "credencial de exemplo (xpto) em produção — preencha ou deixe em branco");
      }
    }
  });

export type Env = z.output<typeof EnvSchema>;

/**
 * Chaves que o schema exige — usadas pelo env:check. Duas passadas: a do objeto
 * vazio pega as obrigatórias diretas; a segunda (com elas preenchidas) pega as
 * exigidas na derivação (DATABASE_URL/BETTER_AUTH_URL, quando não deriváveis).
 */
export function chavesObrigatorias(): string[] {
  const chaves = new Set<string>();
  const coletar = (entrada: Record<string, string>) => {
    const r = EnvSchema.safeParse(entrada);
    if (!r.success) for (const i of r.error.issues) if (i.path[0]) chaves.add(String(i.path[0]));
  };
  coletar({});
  coletar(Object.fromEntries([...chaves].map((k) => [k, k.endsWith("_URL") ? "http://x" : "x".repeat(32)])));
  return [...chaves];
}
