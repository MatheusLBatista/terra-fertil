# template-ia

Template de API (Hono + Drizzle + better-auth + CASL) e painel (Next.js 16) prontos para
novos projetos. O guia do agente está em `CLAUDE.md`; as convenções do painel em
`frontend/CLAUDE.md`.

## Pré-requisitos

| O quê | Para quê |
|---|---|
| **Node 24** — versão fixada em `.nvmrc` (`nvm use` / `fnm use`) | API, painel, scripts; o CI usa a mesma versão |
| **Docker** com Compose v2 | Postgres de dev/testes e a pilha de produção |
| `zip` / `unzip` | `make backup` / `make restore` |
| **Google Chrome** instalado | `ui-verify` e `e2e` rodam o Playwright no Chrome local (`channel: "chrome"`), sem baixar browser |
| `openssl`, `perl`, `make` | `make init` (segredo + renomeação) |

## Criar um projeto a partir do template

```bash
make init NOME=meu-app          # opcional: PORTA_API=3090 PORTA_DB=5450
make setup                      # npm ci (back + front), .env, Postgres de dev, db:reset
make dev-api                    # API em :3080 (docs em /docs)
make dev-front                  # painel em :3000 (outro terminal)
```

- `make init` renomeia os identificadores do template (package.json, .env.example, Makefile,
  composes, título da API e do painel), gera `BETTER_AUTH_SECRET`, cria `backend/.env` e
  `frontend/.env.local` a partir dos exemplos e faz `git init` se preciso.
- `make setup` é idempotente: só copia os `.env` que faltam, espera o Postgres responder
  (`pg_isready`) e roda `db:reset` (drop + migrate + trigger + seeds, com estados/municípios do IBGE).
- Login demo: `admin@example.com` / `102030fs` (também `gestor@` e `usuario@`).

Antes de commitar: `make check` (typecheck + lint + unitários do back; typecheck + lint do front).
Mexeu em schema da API: `make types` (regenera `backend/openapi.json` e `frontend/types/api.d.ts`
— o CI falha se qualquer um dos dois estiver defasado). `make help` lista todos os alvos.

## Variáveis de ambiente (`backend/.env`)

`backend/.env.example` é a referência comentada; a API valida tudo na subida
(`backend/src/lib/envSchema.ts`, fail fast) e lista de uma vez o que está faltando;
`npm run env:check` em `backend/` faz a mesma validação sem subir a API.
Regras gerais:

- **Obrigatória**: sem ela o boot cai. **Opcional**: em branco usa o default (ou desliga o recurso).
  **Só compose**: lida pelo `docker compose`/Makefile, não pela API.
- Integrações opcionais (Google, Garage `OBJECTS_*`/`GARAGE_*`, FS-Mail, OpenObserve) são
  **tudo-ou-nada por grupo**: preencher só metade derruba o boot.
- Derivações: `DATABASE_URL` em branco é montada de `POSTGRES_*`; `BETTER_AUTH_URL` ↔ `API_URL`
  assumem um o outro; `TRUSTED_ORIGINS`/`API_CORS` em branco usam a origem de `FRONTEND_URL`.
- Em produção (`NODE_ENV=production`) o boot recusa valores de exemplo: `BETTER_AUTH_SECRET` de
  exemplo, `POSTGRES_PASSWORD=102030fs`, `ADMIN_PASSWORD=102030fs` e qualquer credencial `xpto`.

<!-- ENV_TABLE_INICIO -->
| Variável | Tipo | Para quê |
|---|---|---|
| `NODE_ENV` | opcional | `development` (default) / `test` / `production` — em produção o boot recusa valores de exemplo |
| `LOG_LEVEL` | opcional | nível do pino (`info` default) |
| `LOG_FILE` | opcional | `true` grava também em `logs/<nome>.log` (dev grava sempre; produção só com `true`) |
| `API_PORT` | opcional | porta da API (`3080`) |
| `API_URL` | obrigatória | URL pública da API — um de `API_URL`/`BETTER_AUTH_URL` basta (um assume o outro) |
| `API_CORS` | opcional | origens do CORS/CSRF separadas por vírgula; em branco usa a origem de `FRONTEND_URL` |
| `DOCS_ENABLED` | opcional | `true` (default) publica `/docs` (Scalar); desligue em API pública |
| `BETTER_AUTH_URL` | obrigatória | URL pública da API para o better-auth (ou `API_URL`) |
| `BETTER_AUTH_SECRET` | obrigatória | ≥ 16 chars; `openssl rand -hex 32` (`make init` já gera); produção recusa o de exemplo |
| `TRUSTED_ORIGINS` | opcional | origens aceitas pelo better-auth; em branco usa a origem de `FRONTEND_URL` |
| `COOKIE_DOMAIN` | opcional | domínio do cookie de sessão quando API e painel estão em subdomínios (`.meuapp.com`); em branco = host da API |
| `FRONTEND_URL` | obrigatória | URL do painel — links dos e-mails e fallback de CORS/origens |
| `AUTH_SIGNUP_ENABLED` | opcional | `true` libera `POST /auth/sign-up` e o primeiro login com Google (default `false`) |
| `GOOGLE_CLIENT_ID` | opcional | OAuth Google — junto com `GOOGLE_CLIENT_SECRET` ou nenhum |
| `GOOGLE_CLIENT_SECRET` | opcional | idem |
| `ADMIN_EMAIL` | opcional | conta admin criada pelo seed; em branco (dev) vale `admin@example.com` / `102030fs`; em produção os três são obrigatórios |
| `ADMIN_PASSWORD` | opcional | idem (produção recusa `102030fs`) |
| `ADMIN_NAME` | opcional | idem |
| `CONTAINER_APP` | só compose | nome do container da API (prod ganha sufixo `_prod`; o migrate, `_prod_migrate`) |
| `CONTAINER_DB` | só compose | nome do container do Postgres (dev usa o nome puro; prod, `_prod`) — o `backup.sh` resolve por ele |
| `CONTAINER_FRONT` | só compose | nome do container do front (`_prod`) |
| `FRONT_API_URL` | só compose | vira `NEXT_PUBLIC_API_URL`/`_CLIENT` no build da imagem do front (URL vista pelo navegador) |
| `FRONT_APP_URL` | só compose | vira `NEXT_PUBLIC_APP_URL` |
| `FRONT_PORT` | só compose | porta publicada do front em produção |
| `FRONT_GOOGLE_LOGIN` | só compose | vira `NEXT_PUBLIC_GOOGLE_LOGIN` |
| `FRONT_AMBIENTE` | só compose | vira `NEXT_PUBLIC_AMBIENTE` (pílula "Ambiente de …"; em branco não aparece) |
| `FRONT_PAGE_SIZES` | só compose | vira `NEXT_PUBLIC_PAGE_SIZES` |
| `FRONT_SIGNUP_ENABLED` | só compose | vira `NEXT_PUBLIC_SIGNUP_ENABLED` — mantenha igual a `AUTH_SIGNUP_ENABLED` |
| `FRONT_APP_NOME` | só compose | vira `NEXT_PUBLIC_APP_NOME` |
| `DATABASE_URL` | obrigatória | conexão da API; em branco é montada de `POSTGRES_USER/PASSWORD/DB` + `localhost:POSTGRES_PORT` |
| `POSTGRES_USER` | só compose | usuário do Postgres (compose) — também fallback de `DATABASE_URL` |
| `POSTGRES_PASSWORD` | só compose | senha (compose) — produção recusa `102030fs` |
| `POSTGRES_DB` | só compose | banco (compose) |
| `POSTGRES_PORT` | só compose | porta publicada do Postgres de dev (`5432`); mude se a porta estiver ocupada |
| `DB_POOL_MAX` | opcional | conexões máximas do pool (`10`) |
| `DB_STATEMENT_TIMEOUT_MS` | opcional | timeout de query em ms (`30000`; `0` desliga) |
| `DATABASE_URL_TEST` | opcional | banco dos testes de integração (nome PRECISA conter `test`); default aponta para o `db_test` do compose |
| `POSTGRES_DB_TEST` | só compose | banco do `db_test` |
| `POSTGRES_PORT_TEST` | só compose | porta do `db_test` (`5434`) |
| `CONTAINER_DB_TEST` | só compose | nome do container do `db_test` |
| `DB_SCHEMA_MODE` | opcional | `migrate` (default, aplica `drizzle/`) ou `push` (sincroniza do model — só protótipo) |
| `HELMET_ENABLED` | opcional | headers de segurança (`true`) |
| `TRUST_PROXY` | opcional | hops do reverse proxy para o IP real chegar ao rate limit (`1` atrás de nginx/traefik); vazio = acesso direto |
| `RATE_LIMIT_ENABLED` | opcional | liga todos os limiters (schema default `false`; o `.env.example` vem com `true`) |
| `RATE_LIMIT_JANELA_MIN` | opcional | janela em minutos (`15`) |
| `RATE_LIMIT_AUTH_MAX` | opcional | tentativas FALHAS de login/cadastro/reset por IP na janela (`20`; `0` desliga) |
| `RATE_LIMIT_GLOBAL_MAX` | opcional | requests por IP na janela (`0` = desligado) |
| `OPENOBSERVE_URL` | opcional | envio de logs ao OpenObserve — com `OPENOBSERVE_TOKEN` ou nenhum |
| `OPENOBSERVE_TOKEN` | opcional | `base64(email:senha)` |
| `OPENOBSERVE_ORG` | opcional | organização (`default`) |
| `OBJECTS_ENDPOINT` | opcional | Garage/S3 — `ENDPOINT`, `BUCKET_NAME`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` juntos ou nenhum |
| `OBJECTS_BUCKET_NAME` | opcional | bucket |
| `OBJECTS_PUBLIC_URL` | opcional | URL pública do bucket (só se ele for público; `uploadToS3` a devolve) |
| `OBJECTS_ACCESS_KEY_ID` | opcional | chave |
| `OBJECTS_SECRET_ACCESS_KEY` | opcional | segredo |
| `OBJECTS_REGION` | opcional | região (`garage`) |
| `GARAGE_URL` | opcional | Admin API do Garage — com `GARAGE_ADMIN_KEY` ou nenhum |
| `GARAGE_ADMIN_KEY` | opcional | chave da Admin API |
| `FSMAIL_URL` | opcional | FS-Mail — com `FSMAIL_API_KEY` ou nenhum; sem eles o e-mail só é logado |
| `FSMAIL_API_KEY` | opcional | chave |
| `FSMAIL_FROM` | opcional | remetente |
<!-- ENV_TABLE_FIM -->

O painel tem o seu `frontend/.env.local` (só `NEXT_PUBLIC_*`, documentadas em `frontend/.env.example`
e `frontend/CLAUDE.md`); em produção elas entram como build args a partir das `FRONT_*` acima.

## Modo desenvolvimento

Tudo pode ser feito da raiz com o Makefile; os comandos por app são estes:

### Back-end (`backend/`)

- `npm run dev` → porta 3080, docs em `/docs`
- `npm run db:reset` → dropa e roda `db:setup`
- `npm run db:setup` → idempotente: `drizzle-kit migrate` (ou `push` com `DB_SCHEMA_MODE=push` / `--push`) + trigger de histórico + seeds
- `npm run db:generate` → ao alterar um model, gera a migration em `drizzle/` (commite junto)
- `npm run db:triggers` → reaplica a trigger de histórico (tabela nova)
- `npm run db:seed:papeis` → reaplica só o seed de papéis/permissões (módulo novo; `db:seed` roda todos)
- `npm run env:check` → compara o `.env` com o `.env.example` e valida com o mesmo schema da API, sem subir nada
- `npm run typecheck` · `npm run lint` · `npm test` (unitários) · `npm run test:integration` (precisa do `db_test`: `make dev-test-db-up`) · `npm run openapi:export`

Migrations desde o primeiro dia: `backend/drizzle/0000_inicial.sql` já está no repositório e
`db:setup` aplica `drizzle-kit migrate` por padrão. `drizzle-kit push` (`DB_SCHEMA_MODE=push`)
continua disponível para protótipo sem dados reais — um banco criado via push não aceita a
primeira migration depois.

### Front-end (`frontend/`)

- `npm run dev` → porta 3000 (precisa da API no ar e do banco semeado)
- `npm run types` (exporta o OpenAPI do back e gera `types/api.d.ts` — sem precisar da API no ar) ou `npm run types:file` (só gera, a partir de `../backend/openapi.json`)
- `npm run typecheck` · `npm run lint` · `npm run check` (os dois + `format:check`) · `npm run ui:verify` · `npm run e2e`

Dados do Postgres de dev em `backend/data/postgres-dev` e do de testes em
`backend/data/postgres-test` (ignorados pelo git).

## Modo produção

1. Configure o `backend/.env`: `BETTER_AUTH_SECRET` real (`openssl rand -hex 32`), senha do banco,
   `ADMIN_*`, `API_CORS`/`TRUSTED_ORIGINS`/`FRONTEND_URL`/`COOKIE_DOMAIN` com as URLs públicas,
   `AUTH_SIGNUP_ENABLED`/`RATE_LIMIT_ENABLED`/`DOCS_ENABLED` conforme o caso, `TRUST_PROXY=1`
   atrás do reverse proxy e as `FRONT_*` usadas no build do front (o front não tem `.env` em produção).
2. `make prod-build` → imagens da API (compartilhada com o `migrate`) e do front.
3. `make prod-up` → banco + `migrate` (one-shot: `db:setup` = migrations + trigger + seeds, a cada
   subida, antes da API) + API + front.
   `make prod-db-migrate` / `prod-db-sync` / `prod-db-seed` continuam como alvos manuais.

Detalhes do `docker-compose.prod.yml`:

- Containers com sufixo `_prod` e dados em `backend/data/postgres-prod`: a pilha de produção
  coexiste com a de dev na mesma máquina.
- Portas publicadas só em `127.0.0.1` (`BIND_IP` no `.env` para mudar) — quem expõe é o reverse
  proxy. Logs do docker com rotação (10 MB × 3) e `TZ=UTC` em todos os serviços.
- Limites de CPU/memória: exemplo comentado (`deploy.resources.limits`) em cada serviço.
- Validar o arquivo: `docker compose --env-file backend/.env -f docker-compose.prod.yml config --quiet`.

Quando alterar models: no dev `npm run db:generate` → commit → `make prod-build` → `make prod-up`
(o `migrate` aplica a migration nova antes de subir a API).

Backup: `make backup` gera `backup/*.zip` (usa o `pg_dump` de dentro do container `_prod`; sem ele,
o de dev; sem container, o `pg_dump` local); `make restore` restaura o mais recente
(`ZIP=arquivo.zip` para outro). O bucket de arquivos não entra no backup.

## Troubleshooting

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `docker compose up` falha com "port is already allocated" na 5432 | outro Postgres na máquina | `POSTGRES_PORT=5440` (e `DATABASE_URL` com a mesma porta) no `backend/.env`; `make dev-infra-up` de novo |
| Login "funciona" mas a sessão não sobe / `fetch` recebe erro de CORS | origem do painel fora de `API_CORS`/`TRUSTED_ORIGINS` | ponha a URL exata do painel (esquema + host + porta) nas duas; em branco ambas usam a origem de `FRONTEND_URL` |
| Loop `/login` → `/dashboard` → `/login` em produção | cookie emitido para um host e lido em outro (API e painel em subdomínios diferentes) | `COOKIE_DOMAIN=.meuapp.com` (com o ponto) cobrindo os dois hosts; com um único host, deixe em branco |
| API não sobe: "credencial de exemplo (xpto) em produção" | `GOOGLE_*`, `OBJECTS_*`, `FSMAIL_API_KEY`… com `xpto` | preencha com a credencial real **ou deixe o grupo inteiro em branco** (a integração fica desligada) |
| Boot cai listando `BETTER_AUTH_SECRET` / `POSTGRES_PASSWORD` | valor de demonstração com `NODE_ENV=production` | gere um segredo (`openssl rand -hex 32`) e troque a senha do banco |
| `migrate` do compose falha na primeira subida em prod | banco criado antes com `push` | banco novo: `make prod-db-migrate`; banco de protótipo: `DB_SCHEMA_MODE=push` |
| CI acusa "OpenAPI sem drift" / "Types sem drift" | esqueceu de regenerar depois de mexer no schema | `make types` e commite `backend/openapi.json` + `frontend/types/api.d.ts` |
| `ui-verify`/`e2e` não acham o browser | Chrome não instalado | instale o Google Chrome (o Playwright usa `channel: "chrome"`) |

## Skills do projeto (`.claude/skills/`)

Instruções que o Claude Code carrega ao trabalhar neste repositório. Invoque
pelo nome (`/design-models`) ou deixe o agente escolher pelo contexto.

| Skill | O que faz | Quando usar |
|---|---|---|
| `design-models` | Cria um model Drizzle em `backend/src/db/` (PK `id`, `...auditColumns`, `withTimezone`, índice em FK, check de centavos, unique parcial), registra no barrel `schema.ts` e gera a migration (`npm run db:generate` → `db:setup`). | Nova entidade/tabela: "criar model X", "nova tabela". |
| `create-routes` | Cria o módulo completo em `backend/src/modules/<entidade>/` (schema zod/OpenAPI, repository, service, controller, routes em Hono) com CASL, envelope `{ data, meta, erros }`, filtros por data, `?incluir=`, `reativar`, 404/204 e os registros globais. | Expor CRUD/endpoints de uma entidade que já tem model. |
| `testes-unitarios` | Teste unitário (vitest) de um service com regras de negócio — 404/409, transações, efeitos colaterais — mockando o repository com `vi.mock`; sem banco nem HTTP. Exemplo real em `backend/src/modules/papeis/papeis.service.test.ts`; `npm test` em `backend/`. | Service que decide algo (lança `AppError`, abre transação, invalida cache/envia e-mail). |
| `testes-integracao` | Teste de integração (vitest + Postgres de teste) das rotas de um módulo via `app.request()` do Hono, sem servidor: login real pelo better-auth, envelope, 401/403, allowlist de sort, soft delete + unique, trigger de histórico. Exemplo real em `backend/src/modules/papeis/papeis.integration.test.ts`; `npm run test:integration` em `backend/` (precisa do `db_test`). | Rota/CRUD novo ou regra que só o banco prova (unique, FK, trigger, soft delete). |
| `data-table-pattern` | Padrão canônico de tela de listagem no painel: TanStack Table v9 + primitivos de tabela do shadcn, filtros, paginação e ordenação na URL via nuqs, dados via TanStack Query lendo o envelope, `queryKey = ["recurso", { filtros }]`, coluna secundária `hidden md:table-cell`, "Ir para a última página", tudo na própria página. Guia de leitura da tela de referência em `.claude/skills/data-table-pattern/reference/`. | Criar ou revisar uma tela de lista ("listar X", "tabela de X"). |
| `form-pattern` | Padrão de cadastro/edição no painel: Sheet lateral com `Formulario` local à página (criar + editar via `registro?`), `react-hook-form` + `zodResolver` (zod v4), montagem só aberto + `key` (sem `useEffect`), `useMutation` + `fetchData` com `invalidateQueries` + toast, `erros[]`/`meta.campos` do 400 inline, `ConfirmacaoDialog` para ação destrutiva, `Dialog` para ação curta, labels/ARIA nos campos. | Criar ou revisar cadastro/edição ("cadastrar X", "formulário de X", "editar X"). |
| `ui-verify` | Validação visual do painel: roda Playwright nos breakpoints do Tailwind (375, 768, 1024, 1440), salva prints em `frontend/e2e/prints/`, checa overflow horizontal e roda `@axe-core/playwright` (WCAG 2 A/AA). `cd frontend && npm run ui:verify` ou `make ui-verify` (aceita `ROTAS=`, `TEMA=`, `LARGURAS=`, `CHECAR=prints|axe`). | Depois de mexer em qualquer tela; quando algo "está desalinhado" ou "quebrou no celular". |
| `acessibility` | Revisão WAI-ARIA/WCAG 2 A/AA de uma tela: roda o axe (`CHECAR=axe ROTAS=/rota npm run ui:verify`) e cobre o que ele não pega — teclado e foco visível, foco preso/devolvido em Sheet/Dialog/AlertDialog, nomes de botões só com ícone, `aria-sort`, `role="status"`/`aria-busy`, erros ligados ao campo, landmarks, contraste nos dois temas, movimento reduzido — com tabela dos componentes base-ui e o estado verificado do template. | Depois de criar/mexer numa tela; "acessibilidade de X", "leitor de tela", "navegação por teclado". |
| `teste-e2e` | Teste ponta a ponta (Playwright) de um fluxo que cruza UI → API → banco — login, CRUD de entidade central, gate de permissão — com seletores acessíveis, nomes únicos e limpeza via API. `cd frontend && npm run e2e` (ou `make e2e`), arquivos em `frontend/e2e/tests/<fluxo>.e2e.ts`. | Fluxo crítico novo ou alterado (login, cadastro principal, permissões). |

Ordem para uma entidade nova: `design-models` → `create-routes` → `testes-unitarios` → `testes-integracao` → `data-table-pattern` (tela) → `form-pattern` → `ui-verify` / `acessibility` → `teste-e2e`.
