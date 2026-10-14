import { rateLimiter } from "hono-rate-limiter";
import { env } from "../lib/env.ts";
import { errorResponse } from "../lib/response.ts";
import { clientIp } from "../lib/hono.ts";

/**
 * Rate limiting pensado para empresas atrás de um IP só (NAT).
 *
 * - `RATE_LIMIT_ENABLED=false` (default) não registra limiter nenhum — todos
 *   os exports abaixo ficam `null`. Com `true`, valem os knobs `RATE_LIMIT_*`.
 * - O limiter de AUTH conta apenas TENTATIVAS FALHAS (`skipSuccessfulRequests`):
 *   logins bem-sucedidos não gastam cota, então um escritório inteiro logando
 *   pelo mesmo IP não é penalizado — mas brute force (que falha) estoura o
 *   limite rapidamente. Aplicado em /auth/sign-in, /auth/sign-up e nas rotas
 *   de reset de senha (forget-password, request-password-reset, reset-password).
 * - O limiter GLOBAL é opcional (RATE_LIMIT_GLOBAL_MAX=0 desliga, o default)
 *   justamente porque limite global por IP pune IPs compartilhados.
 * - Atrás de reverse proxy, configure TRUST_PROXY (ex.: 1) para o IP real do
 *   cliente chegar aqui em vez do IP do proxy (ver `clientIp` em lib/hono.ts).
 *
 * O store é em memória (por processo) — suficiente para uma instância.
 */

const ligado = env.RATE_LIMIT_ENABLED;
const janelaMs = env.RATE_LIMIT_JANELA_MIN * 60_000;

function criarLimiter(max: number, mensagem: string, apenasFalhas: boolean) {
  return rateLimiter({
    windowMs: janelaMs,
    limit: max,
    skipSuccessfulRequests: apenasFalhas,
    standardHeaders: "draft-7",
    keyGenerator: (c) => clientIp(c) || "desconhecido",
    handler: (c) => c.json(errorResponse(mensagem), 429),
  });
}

/** Brute force de login/cadastro/reset — só conta respostas de erro (>= 400). */
export const authRateLimiter =
  ligado && env.RATE_LIMIT_AUTH_MAX > 0
    ? criarLimiter(
        env.RATE_LIMIT_AUTH_MAX,
        `Muitas tentativas de autenticação. Tente novamente em ${env.RATE_LIMIT_JANELA_MIN} minuto(s).`,
        true,
      )
    : null;

/** Limite geral por IP — desligado por padrão (veja o comentário acima). */
export const globalRateLimiter =
  ligado && env.RATE_LIMIT_GLOBAL_MAX > 0
    ? criarLimiter(env.RATE_LIMIT_GLOBAL_MAX, "Muitas requisições. Tente novamente em instantes.", false)
    : null;

/** POST /logs (logs do frontend) — endpoint público, então tem teto próprio. */
export const logsRateLimiter = ligado ? criarLimiter(120, "Muitos logs enviados. Aguarde.", false) : null;
