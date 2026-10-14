import { pgEnum } from "drizzle-orm/pg-core";

// ─── Auditoria / Histórico ────────────────────────────────────────────────────

export const operacaoHistoricoEnum = pgEnum("operacao_historico", ["INSERT", "UPDATE", "DELETE"]);

// ─── Autorização (RBAC/CASL) ─────────────────────────────────────────────────

export const acaoPermissaoEnum = pgEnum("acao_permissao", ["manage", "create", "read", "update", "delete"]);
