# ─── template-ia ──────────────────────────────────────────────────────────────
# Desenvolvimento: Postgres em Docker + API e painel locais (npm run dev).
# Produção: banco + migrate + API + front em containers (docker-compose.prod.yml).
#
# Projeto novo : make init NOME=meu-app  (renomeia, gera segredo, cria os .env)
# Primeira vez : make setup   (npm ci nos dois apps, .env, Postgres, db:reset)
# Fluxo dev    : make dev-api  +  make dev-front   (dois terminais)
# Antes do commit: make check  (typecheck + lint + unitários) · make types se
#                mexeu em schema (openapi.json + types/api.d.ts — o CI acusa drift)
# Fluxo prod   : make prod-build && make prod-up — o serviço `migrate` do compose
#                aplica migrations + trigger + seeds a cada subida, antes da API
#                (prod-db-migrate / prod-db-sync / prod-db-seed ficam como manuais).
#
# `make help` lista todos os alvos.

# -p fixa o nome do projeto no Docker: sem isso ele vira o nome da pasta ("backend"),
# que colide com qualquer outro projeto que tenha uma pasta backend/.
DEV_COMPOSE  = docker compose -p template-ia-dev --env-file backend/.env -f backend/docker-compose.yml
PROD_COMPOSE = docker compose --env-file backend/.env -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: init setup check types \
        dev-infra-up dev-infra-down dev-db-wait dev-db-reset dev-api dev-front \
        dev-test-db-up dev-test dev-test-integration dev-test-all ui-verify e2e \
        backup restore \
        prod-build prod-up prod-down prod-restart prod-logs prod-status \
        prod-front-logs prod-front-restart \
        prod-db-sync prod-db-migrate prod-db-seed help

# ─── Bootstrap ────────────────────────────────────────────────────────────────

init:            ## Cria um projeto novo a partir do template (NOME=meu-app [PORTA_API=3080 PORTA_DB=5432])
	@./scripts/init.sh "$(NOME)" "$(PORTA_API)" "$(PORTA_DB)"

setup:           ## Primeira vez: npm ci (back + front), .env a partir dos exemplos, Postgres de dev e db:reset
	@[ -f backend/.env ] || { cp backend/.env.example backend/.env; echo "+ backend/.env criado a partir do .env.example"; }
	@[ -f frontend/.env.local ] || { cp frontend/.env.example frontend/.env.local; echo "+ frontend/.env.local criado a partir do .env.example"; }
	cd backend && npm ci
	cd frontend && npm ci
	$(MAKE) dev-infra-up
	$(MAKE) dev-db-wait
	$(MAKE) dev-db-reset
	@echo "✓ Pronto: make dev-api (API :3080) e make dev-front (painel :3000). Login admin@example.com / 102030fs"

check:           ## Typecheck + lint + testes unitários do back e typecheck + lint do front (sem banco)
	cd backend && npm run typecheck && npm test && npm run lint --if-present
	cd frontend && npm run typecheck && npm run lint

types:           ## Regenera backend/openapi.json (export) e frontend/types/api.d.ts a partir dele
	cd backend && npm run openapi:export
	cd frontend && npm run types:file

# ─── Desenvolvimento ──────────────────────────────────────────────────────────

dev-infra-up:    ## Sobe o Postgres de dev e o de testes (dados em backend/data/postgres-dev e postgres-test)
	$(DEV_COMPOSE) up -d

dev-infra-down:  ## Derruba a infra de dev (os dados são preservados)
	$(DEV_COMPOSE) down

dev-db-wait:     ## Espera o Postgres de dev responder ao pg_isready (até 60 s)
	@for i in $$(seq 1 30); do \
	  $(DEV_COMPOSE) exec -T db sh -c 'pg_isready -q -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' 2>/dev/null && { echo "✓ Postgres de dev pronto"; exit 0; }; \
	  sleep 2; \
	done; echo "✖ Postgres de dev não respondeu em 60 s ($(DEV_COMPOSE) logs db)"; exit 1

dev-db-reset:    ## Recria o banco de dev: drop + migrate + triggers + seeds
	cd backend && npm run db:reset

dev-api:         ## Roda a API em modo watch (porta 3080, docs em /docs)
	cd backend && npm run dev

dev-test-db-up:  ## Sobe só o Postgres de testes (db_test, porta 5434)
	$(DEV_COMPOSE) up -d db_test

dev-test:        ## Testes unitários do back-end (sem banco)
	cd backend && npm test

dev-test-integration: ## Testes de integração do back-end (precisa do db_test no ar)
	cd backend && npm run test:integration

dev-test-all:    ## Unitários + integração
	cd backend && npm run test:all

dev-front:       ## Roda o painel em modo dev (porta 3000)
	cd frontend && npm run dev

ui-verify:       ## Prints por breakpoint + overflow + axe (ROTAS=/x,/y TEMA=light LARGURAS=375,1440 CHECAR=prints|axe)
	cd frontend && npm run ui:verify

e2e:             ## Testes ponta a ponta (Playwright, precisa da API e do front no ar)
	cd frontend && npm run e2e

# ─── Backup ───────────────────────────────────────────────────────────────────

backup:          ## Dump do banco (container _prod, senão o de dev, senão pg_dump local) em backup/*.zip
	./backup.sh

restore:         ## Restaura o .zip mais recente de backup/ (ou ZIP=arquivo.zip)
	./restore.sh $(ZIP)

# ─── Produção ─────────────────────────────────────────────────────────────────

prod-build:      ## Builda as imagens da API (compartilhada com o migrate) e do front
	$(PROD_COMPOSE) build

prod-up:         ## Sobe banco + migrate (one-shot) + API + front (portas em 127.0.0.1; BIND_IP para mudar)
	$(PROD_COMPOSE) up -d

prod-down:       ## Derruba os containers (os dados são preservados)
	$(PROD_COMPOSE) down

prod-restart:    ## Reinicia a API
	$(PROD_COMPOSE) restart api

prod-logs:       ## Logs da API (follow)
	$(PROD_COMPOSE) logs -f api

prod-front-logs: ## Logs do front (follow)
	$(PROD_COMPOSE) logs -f front

prod-front-restart: ## Reinicia o front
	$(PROD_COMPOSE) restart front

prod-status:     ## Status dos serviços
	$(PROD_COMPOSE) ps

prod-db-migrate: ## Manual (o migrate do compose já faz isso na subida): drizzle-kit migrate + trigger
	$(PROD_COMPOSE) exec api npx drizzle-kit migrate
	$(PROD_COMPOSE) exec api npx tsx src/scripts/applyTriggers.ts

prod-db-sync:    ## Manual, alternativa sem migrations: drizzle-kit push direto do model (só protótipo sem dados reais) + trigger
	$(PROD_COMPOSE) exec api npx drizzle-kit push --force
	$(PROD_COMPOSE) exec api npx tsx src/scripts/applyTriggers.ts

prod-db-seed:    ## Manual: roda os seeds dentro do container da API
	$(PROD_COMPOSE) exec api npx tsx src/seeds/index.ts

help:            ## Lista os alvos
	@grep -E '^[a-z0-9-]+: *##' $(MAKEFILE_LIST) | sed 's/: *## / — /'
