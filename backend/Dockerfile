# ── Build ────────────────────────────────────────────────────────────────────
# Runtime é Node; o Bun entra só como gerenciador de pacotes (bun.lock) e para
# os comandos operacionais (`bunx drizzle-kit`/`bunx tsx` do setupDb.ts).
FROM oven/bun:1.4.3-alpine AS bun

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# Garante a pasta de migrations mesmo em projetos que ainda usam só `push`
# (o COPY do estágio final não pode referenciar pasta inexistente)
RUN mkdir -p drizzle
RUN bun run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
# src/, drizzle/ e a config ficam na imagem para os comandos operacionais
# (push/migrate/triggers/seed rodam com bunx tsx/drizzle-kit no container)
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Roda como usuário sem privilégios; logs/ precisa ser gravável (pino escreve arquivo)
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 api \
  && mkdir -p logs && chown -R api:nodejs logs
USER api

EXPOSE 3080
CMD ["node", "dist/server.js"]
