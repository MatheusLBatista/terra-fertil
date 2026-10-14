// Barrel do schema Drizzle — é o `schema` apontado pelo drizzle.config.ts.
// Todo model novo PRECISA ser re-exportado aqui para entrar nas migrations.

// ─── Better Auth ─────────────────────────────────────────────────────────────
export * from "./user.ts";
export * from "./account.ts";
export * from "./session.ts";
export * from "./verification.ts";

// ─── Enums ───────────────────────────────────────────────────────────────────
export * from "./enums.ts";

// ─── Auditoria ───────────────────────────────────────────────────────────────
export * from "./historicoAlteracao.ts";

// ─── Autorização (RBAC) ──────────────────────────────────────────────────────
export * from "./papel.ts";
export * from "./permissao.ts";

// ─── Localização (IBGE) ──────────────────────────────────────────────────────
export * from "./estado.ts";
export * from "./municipio.ts";

// ─── Domínio ─────────────────────────────────────────────────────────────────
// (os models das entidades do seu domínio entram aqui)
