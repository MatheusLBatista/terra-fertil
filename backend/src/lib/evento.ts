import { getLogger } from "./logger.ts";

/**
 * Eventos de negócio estruturados — um log com nome estável (`dominio.acao`)
 * e dados filtráveis. Use para desfechos relevantes que o `requestLogger`
 * não enxerga (jobs, importações, e-mails, integrações):
 *
 *   evento.info("papel.criado", { papelId, nome });
 *   evento.warn("importacao.falhou", { arquivo, motivo });
 *
 * Dentro de uma requisição sai com `requestId`/`userId` (getLogger). No
 * OpenObserve dá para filtrar por `evento = 'importacao.falhou'`.
 */
type Nivel = "info" | "warn" | "error";

function emitir(nivel: Nivel, nome: string, dados: Record<string, unknown>) {
  getLogger()[nivel]({ evento: nome, ...dados }, nome);
}

export const evento = {
  info: (nome: string, dados: Record<string, unknown> = {}) => emitir("info", nome, dados),
  warn: (nome: string, dados: Record<string, unknown> = {}) => emitir("warn", nome, dados),
  error: (nome: string, dados: Record<string, unknown> = {}) => emitir("error", nome, dados),
};
