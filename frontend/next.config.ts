import type { NextConfig } from "next";

const DEV = process.env.NODE_ENV !== "production";

// Origem da API para o `connect-src` (o `lib/env.ts` valida a variável no app;
// aqui só se extrai a origem, sem derrubar o `next dev` por causa do config).
function origemDaApi(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL_CLIENT || "").origin;
  } catch {
    return "";
  }
}

/**
 * Content-Security-Policy do painel.
 *
 * - `script-src 'unsafe-inline'`: o App Router injeta scripts inline (payload
 *   RSC, `next-themes`); sem nonce por request (exigiria tornar tudo dinâmico
 *   no `proxy.ts`) é o mínimo que o Next precisa. `'unsafe-eval'` só em dev
 *   (source maps / Fast Refresh).
 * - `style-src 'unsafe-inline'`: estilos inline do React/base-ui.
 * - `connect-src`: a API (cookie de sessão) e, em dev, o WebSocket do HMR.
 * - `img-src https:`: avatar do Google no rodapé do menu.
 * - Fontes do `next/font` são servidas pelo próprio app (`'self'`).
 * - O OAuth do Google é uma navegação de página inteira (API → Google → API),
 *   não um frame nem um fetch daqui: nada a liberar.
 */
function csp(): string {
  const api = origemDaApi();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${api ? ` ${api}` : ""}${DEV ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const CABECALHOS_SEGURANCA = [
  { key: "Content-Security-Policy", value: csp() },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Produção em container: `next build` gera .next/standalone com server.js
  // auto-contido (ver Dockerfile) — sem node_modules completo na imagem final.
  output: "standalone",
  poweredByHeader: false,
  // O `next dev` do 16.3 anexa um bloco "agent rules" ao CLAUDE.md da pasta;
  // o nosso é curado à mão, então fica desligado.
  agentRules: false,
  async headers() {
    return [{ source: "/(.*)", headers: CABECALHOS_SEGURANCA }];
  },
};

export default nextConfig;
