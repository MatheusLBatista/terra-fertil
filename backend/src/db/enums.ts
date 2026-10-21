import { pgEnum } from "drizzle-orm/pg-core";

// ─── Auditoria / Histórico ────────────────────────────────────────────────────

export const operacaoHistoricoEnum = pgEnum("operacao_historico", ["INSERT", "UPDATE", "DELETE"]);

// ─── Autorização (RBAC/CASL) ─────────────────────────────────────────────────

export const acaoPermissaoEnum = pgEnum("acao_permissao", ["manage", "create", "read", "update", "delete"]);

// ─── Projetos ────────────────────────────────────────────────────────────────

export const projetoSituacaoEnum = pgEnum("projeto_situacao", ["planejado", "em_execucao", "encerrado"]);

export const equipeTipoEnum = pgEnum("equipe_tipo", [
  "coordenador",
  "tecnico",
  "estudante",
  "administrativo",
]);
