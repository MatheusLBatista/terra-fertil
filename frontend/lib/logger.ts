import { env } from "@/lib/env";

const SENSITIVE_KEYS = new Set([
  "password",
  "senha",
  "token",
  "secret",
  "authorization",
  "cookie",
  "passwd",
  "pass",
  "pwd",
  "chave",
  "hash",
  "apikey",
  "api_key",
  "newpassword",
  "currentpassword",
  "novasenha",
]);

type LogLevel = "error" | "warn" | "info" | "debug";
type LogPayload = {
  level: LogLevel;
  message: string;
  timestamp: string;
  url: string;
  component?: string;
  context?: unknown;
  userId?: string;
};

// Preenchido pelo layout (auth) a partir da sessão; vai em todo log como `userId`.
let usuarioAtual: string | undefined;

/** Define (ou limpa, com `undefined`) o usuário anexado aos próximos logs. */
export function setUsuarioAtual(id: string | undefined) {
  usuarioAtual = id;
}

function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, depth + 1));
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(value, depth + 1);
  }
  return sanitized;
}

function send(level: LogLevel, message: string, context?: unknown, component?: string): void {
  if (typeof window === "undefined") return;

  const payload: { logs: LogPayload[] } = {
    logs: [
      {
        level,
        message,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        component,
        context: context !== undefined ? sanitize(context) : undefined,
        userId: usuarioAtual,
      },
    ],
  };

  // Fire-and-forget — nunca bloqueia a UI. Vai para o POST /logs da API, que
  // injeta no pino do backend (arquivo/stdout/OpenObserve, stream "frontend").
  fetch(`${env.API_URL}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
    keepalive: true,
  }).catch(() => {
    // Logging nunca derruba a tela.
  });
}

export const logger = {
  debug: (message: string, context?: unknown, component?: string) =>
    send("debug", message, context, component),
  info: (message: string, context?: unknown, component?: string) => send("info", message, context, component),
  warn: (message: string, context?: unknown, component?: string) => send("warn", message, context, component),
  error: (message: string, context?: unknown, component?: string) =>
    send("error", message, context, component),
};
