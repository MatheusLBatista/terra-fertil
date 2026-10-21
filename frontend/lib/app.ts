import { env } from "@/lib/env";

export const APP_NOME = env.APP_NOME ?? "Terra Fértil";

export const APP_DESCRICAO = `Painel administrativo do ${APP_NOME} — Next.js + Better Auth sobre a API do back-end.`;

export const SIGNUP_HABILITADO = env.SIGNUP_ENABLED;

/**
 * Valida o `?next=` que o proxy/logout repassam ao login: só caminho interno
 * (começa com "/" e não com "//" nem "/\"), para nunca virar open redirect.
 */
export function destinoInterno(destino: string | null | undefined): string | null {
  if (!destino || !destino.startsWith("/") || destino.startsWith("//") || destino.startsWith("/\\")) {
    return null;
  }
  return destino;
}
