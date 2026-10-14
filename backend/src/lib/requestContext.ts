import { AsyncLocalStorage } from "node:async_hooks";
import type { AppAbility } from "./casl/ability.ts";

/**
 * Contexto por requisição, propagado via AsyncLocalStorage.
 *
 * - `requestId` (requestLogger) → correlação nos logs via `getLogger()`.
 * - `userId` / `role` / `ability` (requireAuth) → colunas de auditoria
 *   (created_by / updated_by) e checagens dentro dos services, sem passar o
 *   usuário à mão por todas as camadas (controller → service → repository).
 */
export interface RequestContext {
  requestId?: string;
  userId?: string;
  role?: string;
  ability?: AppAbility;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Executa `fn` dentro de um novo contexto de requisição. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Retorna o contexto atual (mutável) ou `undefined` fora de uma requisição. */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Id do usuário autenticado na requisição atual, se houver. */
export function getCurrentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
