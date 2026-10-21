# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# Bun só instala (bun.lock) e roda os scripts; o `next build` e o runtime são Node.
FROM oven/bun:1.4.3-alpine AS bun

FROM node:24-alpine AS builder

WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# As NEXT_PUBLIC_* são embutidas no bundle: precisam existir no BUILD, não só
# no runtime (o .gitlab-ci.yml passa as URLs do QA como --build-arg).
# `lib/env.ts` valida todas no build — variável obrigatória em branco derruba o `next build`.
ARG NEXT_PUBLIC_API_URL
# DEPRECIADA: fallback de NEXT_PUBLIC_API_URL enquanto os .env antigos existirem.
ARG NEXT_PUBLIC_API_URL_CLIENT=
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GOOGLE_LOGIN=false
ARG NEXT_PUBLIC_SIGNUP_ENABLED=false
# Opcionais: em branco = nome padrão / pílula de ambiente escondida / tamanhos de
# página padrão / fuso do navegador / tema dark.
ARG NEXT_PUBLIC_APP_NOME=
ARG NEXT_PUBLIC_AMBIENTE=
ARG NEXT_PUBLIC_PAGE_SIZES=
ARG NEXT_PUBLIC_TIMEZONE=
ARG NEXT_PUBLIC_TEMA_PADRAO=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_API_URL_CLIENT=$NEXT_PUBLIC_API_URL_CLIENT \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_GOOGLE_LOGIN=$NEXT_PUBLIC_GOOGLE_LOGIN \
    NEXT_PUBLIC_SIGNUP_ENABLED=$NEXT_PUBLIC_SIGNUP_ENABLED \
    NEXT_PUBLIC_APP_NOME=$NEXT_PUBLIC_APP_NOME \
    NEXT_PUBLIC_AMBIENTE=$NEXT_PUBLIC_AMBIENTE \
    NEXT_PUBLIC_PAGE_SIZES=$NEXT_PUBLIC_PAGE_SIZES \
    NEXT_PUBLIC_TIMEZONE=$NEXT_PUBLIC_TIMEZONE \
    NEXT_PUBLIC_TEMA_PADRAO=$NEXT_PUBLIC_TEMA_PADRAO

RUN bun run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
# `output: "standalone"` (next.config.ts) gera .next/standalone/server.js
# auto-contido — sem node_modules completo na imagem final.
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

# Roda sem root: usuário/grupo próprios e arquivos com o dono certo.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]
