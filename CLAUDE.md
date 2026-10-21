# template-ia — guia para o agente

Monorepo com a API em `backend/` e o painel em `frontend/`. Gerenciador: **Bun** (runtime segue
Node — `tsx`/`next`). Cada app tem o seu `bun.lock` e o seu `node_modules`; a raiz NÃO tem
dependências nem `node_modules` (não use `workspaces` — o Bun criaria `node_modules/.bun` na raiz).
Rode os comandos dentro da pasta do app (`bun run <script>`; `bun run test` — nunca `bun test`,
que é o runner do Bun e não o vitest) ou os scripts do `package.json` da raiz. As convenções
do painel estão em `frontend/CLAUDE.md` — leia-o antes de mexer lá.

## Arquitetura (back-end)

Hono (@hono/node-server) + Drizzle + better-auth + CASL + zod-to-openapi.
Módulos em `src/modules/<entidade>/` com 5 arquivos — `schema` (zod + OpenAPI),
`repository` (única camada que importa `db`), `service` (regras, `AppError`),
`controller` (safeParse + envelope; recebe o `AppContext` do Hono), `routes` (`requireAuth` + `requirePermission`).
Models em `src/db/` (1 arquivo por tabela + barrel `schema.ts`).
Módulos de referência: `src/modules/papeis/` (CRUD completo — transação, conflitos 409,
soft delete, cache, **ordenação por allowlist** `SORT_PAPEIS`) e `src/modules/municipios/`
(leitura pública com filtros e paginação; sem `sort`).

## Convenções inegociáveis

- **Envelope** de toda resposta da API: `{ data, meta, erros }` — sucesso e erro.
  400 de validação vem de `respostaValidacao` (`src/lib/zod.ts`): `erros[]` + `meta.campos`.
- **Soft delete**: DELETE marca `deletedAt` (204; id inexistente ou já excluído → 404);
  toda leitura filtra `isNull(deletedAt)`. `ativo` é status de negócio (PATCH), não exclusão.
  Entidade com unique TOTAL (alvo de FK, como `papeis.nome`) ganha `POST /:id/reativar`.
- **Auditoria**: todo model de domínio termina com `...auditColumns` (src/db/audit.ts) e tem PK
  (a trigger lê a PK real pelo catálogo; fallback `id`). `createdBy/updatedBy` são preenchidos via AsyncLocalStorage — nunca passe userId à mão.
  A trigger `trg_historico` (auto-descoberta por `deleted_at`) grava tudo em
  `historico_alteracoes`; o `db:setup` aplica a trigger (tabela criada por outro caminho: `bun run db:triggers`).
- **Autorização**: CASL (`src/lib/casl/ability.ts`) dirigido pelo **banco** — tabelas
  `papeis` e `permissoes` (par acao+subject), cache de 30s por papel. Papéis seed:
  admin / gestor / usuario. `user.role` tem **FK** para `papeis.nome` (chave natural;
  o better-auth segue gravando a string — `defaultRole: "usuario"` no plugin admin).
  Toda rota autenticada usa `requireAuth` + `requirePermission(acao, "Subject")`.
  Módulo novo NÃO altera o ability.ts: registra as permissões no seed
  `src/seeds/papeis.ts` (ou direto na tabela).
- **Ordenação**: `sort=campo:asc|desc` validado contra allowlist por módulo
  (`sortSchema` + mapa `SORT_COLUMNS` no repository). Nunca interpole nome de coluna.
- **Dinheiro sempre em centavos** (inteiro, `check >= 0`), nunca float — helpers em
  `src/lib/dinheiro.ts`. Timestamps sempre `withTimezone: true`; FK sempre com índice.
- **E-mail**: envio direto via `sendEmail()` (`src/lib/mail/fsmail.ts`) → FS-Mail.
  Sem `FSMAIL_API_KEY`, só loga (dev). Não há filas — Redis/BullMQ foram removidos.
- **Arquivos**: Garage via S3 (`src/lib/storage/`) — upload pela API (`lerArquivo`/`lerDocumento`
  + `uploadToS3`). `uploadToS3` devolve a URL pública (`OBJECTS_PUBLIC_URL`), que só vale para
  bucket público; arquivo privado sai por proxy autenticado (`downloadFromS3` + `respostaDeStream`)
  — o cliente nunca fala com o bucket. Credenciais `OBJECTS_*` no `.env`.
- **Logs**: pino (`src/lib/logger.ts`) → stdout (+ arquivo em `logs/` em dev ou com `LOG_FILE=true`);
  com `OPENOBSERVE_URL`/`OPENOBSERVE_TOKEN` no `.env`, envia também ao OpenObserve.
  `POST /logs` recebe os logs do frontend (validado + rate limit, stream "frontend").
- **HTTP (Hono)**: handlers recebem `c: AppContext` (`src/lib/hono.ts`) e RETORNAM a resposta
  (`return c.json(successResponse(...), 201)`; 204 = `c.body(null, 204)`). Corpo JSON via
  `lerJson(c)` (400 se inválido, 415 se não for JSON), query via `c.req.query()`, params via
  `c.req.param()`. Upload: `lerArquivo(c)`/`lerDocumento(c)` + `bodyLimit` na rota.
  Erros não tratados caem no `errorHandler` (`app.onError`); 404 mantém o envelope.
  Eventos de negócio → `evento.info("x.y", {...})` (`src/lib/evento.ts`).
- **Env validado no boot** (`src/lib/envSchema.ts` + `env.ts`, fail-fast): integrações opcionais
  ficam EM BRANCO no `.env` (= desligadas) e são tudo-ou-nada por grupo; o essencial derruba o
  boot se faltar; em produção valores de exemplo (`xpto`, `102030fs`, segredo de exemplo) são
  recusados. `env.ts` é o ÚNICO lugar que lê `process.env` — todo código importa `env` daí
  (e `env.ts` não importa o logger: ciclo). `bun run env:check` valida o `.env` contra o schema e
  o `.env.example` sem subir a API. `DOCS_ENABLED=false` esconde o `/docs` em produção.
- **Cadastro público**: `AUTH_SIGNUP_ENABLED` (default false) controla `POST /auth/sign-up`
  e o primeiro login com Google; desligado, contas nascem pelo painel ou pelo seed.
- **Segurança HTTP**: `secureHeaders` (hono) + CSRF (`hono/csrf`, origens = `API_CORS` ∪
  `TRUSTED_ORIGINS` ∪ `FRONTEND_URL` ∪ origem da API) + rate limit (`src/middlewares/rateLimit.ts`,
  só com `RATE_LIMIT_ENABLED=true`) — o limiter de auth conta só tentativas FALHAS; knobs no
  `.env` (`HELMET_ENABLED`, `TRUST_PROXY`, `RATE_LIMIT_*`). `bodyLimit` global de 1 MB ignora
  multipart (cada rota de upload define o seu). `/ping` = liveness, `/health` = readiness
  (toca o banco). `server.ts` faz graceful shutdown em SIGTERM/SIGINT.

## Skills (use-as para novas entidades)

`design-models` → `create-routes` → `testes-unitarios` (service com regra) → `testes-integracao`
(rotas + banco) → `data-table-pattern` (tela de listagem) → `form-pattern` (cadastro/edição).
Depois de mexer em tela do painel: `ui-verify` (prints, overflow e axe; `CHECAR=axe` só
acessibilidade) e `acessibility`; fluxos críticos ganham `teste-e2e`.

## Checklist ao criar entidade (registros fáceis de esquecer)

1. Model em `src/db/<x>.ts` + `export` no barrel `src/db/schema.ts` → `bun run db:generate` (migration commitada)
2. `bun run db:triggers` (auditoria da tabela nova; o `db:setup` também aplica)
3. Módulo em `src/modules/index.ts` (`MODULOS` + import do `<x>.schema.ts`) — `routes/index.ts` e `app.ts` não mudam
4. Permissões do novo Subject no seed de papéis (`src/seeds/papeis.ts`) + `bun run db:seed:papeis`
5. Tabela em `TABELAS_DOMINIO` (`src/test/setup.ts`) para os testes de integração
6. `bun run types` (openapi.json + types/api.d.ts) e item em `NAV_GROUPS` no painel

## Validação rápida

`bun run check` (typecheck + lint + unitários do back; typecheck + lint do front) ·
`bun run types` (regenera `backend/openapi.json` + `frontend/types/api.d.ts`; o CI acusa drift)
· `bun run test:integration` em `backend/` (precisa do `db_test`: `bun run db:test:up`).

## Ambiente dev

Projeto novo: editar `backend/.env` e `frontend/.env.local` (a partir dos `.env.example`) →
`bun run setup` (bun install nos dois apps, Postgres de dev, `db:reset`) → `bun run dev:api` (porta 3080,
docs em /docs) + `bun run dev:front` (porta 3000). Node 24 + Bun. `bun install` na raiz instala os dois
apps (postinstall). Dependência nova: `bun add <pkg>` DENTRO de `backend/` ou `frontend/`.
Postgres de dev em Docker (`docker-compose.yml` da raiz, variáveis do `backend/.env`; `bun run db:up` /
`db:down` / `db:test:up`), dados em `data/postgres-dev` e `data/postgres-test` na raiz (ignorados no git). `bun run db:reset` = drop + migrate + triggers +
seeds (inclui estados/municípios do IBGE). Login demo: `fslab.vilhena@ifro.edu.br` / `102030fs`
(também gestor@example.com e usuario@example.com).
**Migrations desde o dia 1**: `backend/drizzle/` é versionado; ao alterar um model rode
`bun run db:generate` e commite a migration. `db:setup` aplica `drizzle-kit migrate`
(`DB_SCHEMA_MODE=push` ou `--push` troca por push — só protótipo sem dados reais).
CI/CD: `.gitlab-ci.yml` — em todo push/MR, jobs `backend` (typecheck, lint, format, unitários,
integração com Postgres de serviço, build, drift do `openapi.json`) e `frontend` (drift do
`types/api.d.ts`, typecheck, lint, format, build). No branch `development` publica as imagens no
Harbor e faz o deploy do QA: `docker-compose.qa.yml` + `ci/deploy-qa.sh` na VM (backup do banco,
pull, `up -d` — o serviço `migrate` roda o `db:setup` antes da API —, espera o `/health`).

## Front-end (`frontend/` — detalhes em `frontend/CLAUDE.md`)

Next.js 16 (App Router) + TanStack Query + better-auth + shadcn/ui, na porta 3000.

- Sessão por **cookie httpOnly**; `lib/fetchData.ts` manda `credentials: "include"`.
  401 desloga, 403 é falta de permissão do papel e fica na tela.
- Papel = `user.role` (admin/gestor/usuario) via `lib/papeis.ts`. Módulo novo:
  permissão no seed do back + item em `NAV_GROUPS` (`lib/navegacao.ts`).
- Tipos **gerados** do OpenAPI do back (`bun run types` ou `bun run types`) — nunca editar
  `types/api.d.ts` à mão.
- `/dashboard` é intencionalmente vazio; a listagem de referência para copiar é
  `app/(auth)/municipios/page.tsx` (ordenação: `papeis/page.tsx`).
- Inputs numéricos: `z.number()` + `register(name, { valueAsNumber: true })`
  (não use `z.coerce` no resolver — quebra no zod v4).
  Formulários com máscara: `FormValues = z.input` / `FormOutput = z.output`.
