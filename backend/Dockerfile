# ── Build ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Garante a pasta de migrations mesmo em projetos que ainda usam só `push`
# (o COPY do estágio final não pode referenciar pasta inexistente)
RUN mkdir -p drizzle
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
# src/, drizzle/ e a config ficam na imagem para os alvos operacionais do
# Makefile (push/migrate/triggers/seed rodam com tsx/drizzle-kit no container)
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
