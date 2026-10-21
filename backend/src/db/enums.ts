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

// ─── Associações ─────────────────────────────────────────────────────────────

export const contatoFuncaoEnum = pgEnum("contato_funcao", ["presidente", "contato", "outro"]);

export const documentoSituacaoEnum = pgEnum("documento_situacao", [
  "pendente",
  "recebido",
  "validado",
  "rejeitado",
]);
