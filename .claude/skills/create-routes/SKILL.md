---
name: create-routes
description: Cria um módulo de API completo no back-end (schema zod/OpenAPI + repository + service + controller + routes em Hono) para uma entidade, com CASL e envelope { data, meta, erros }. Use ao expor um CRUD/endpoints — "criar rotas de X", "endpoint para X", "CRUD de X".
---

# Criar módulo de API (Hono)

Módulo canônico: `backend/src/modules/papeis/` — CRUD completo (transação, 409 de conflito, soft delete, PATCH com `camposParaAtualizar`). Leia os 5 arquivos antes de criar qualquer módulo. Para leitura pública simples (sem auth), veja `backend/src/modules/municipios/`; para filtros de consulta (tabela, operação, autor) veja `backend/src/modules/historico/`. Pré-requisito: o model já existe (skill `design-models`).

## Regra de ouro das camadas

| Camada | Pode | NÃO pode |
|---|---|---|
| `*.routes.ts` | `createRouter()` (lib/hono.ts), montar rotas, aplicar `requireAuth` + `requirePermission` | validar corpo, tocar banco |
| `*.controller.ts` | recebe `c: AppContext`; `safeParse` do zod (`c.req.query()`, `c.req.param()`, `await lerJson(c)`), RETORNA `c.json(successResponse/errorResponse, status)` | regra de negócio, SQL |
| `*.service.ts` | regras de negócio, `AppError` (lib/appError.ts), abrir `db.transaction` | conhecer HTTP (`c`, headers), montar SQL |
| `*.repository.ts` | **única camada que monta query com `db`**; recebe `tx: DbOrTx = db` como último parâmetro | regra de negócio |
| `*.schema.ts` | zod de entrada/saída + `registry.register`/`registerPath` (OpenAPI) | lógica |

## Passos — crie `backend/src/modules/<entidade>/` com 5 arquivos

1. **`<entidade>.schema.ts`** — copie o formato de `papeis.schema.ts`:
   - `XSchema` (resposta), `CreateXSchema`, `UpdateXSchema` (tudo `.optional()`), `ListXQuerySchema` com `...paginacaoQuery` e `sort: sortSchema(SORT_X)` — `SORT_X` é a **allowlist** de colunas ordenáveis (o front lê essa lista para ordenar).
   - **Filtros** entram no `ListXQuerySchema`, todos `.optional()`: texto (`nome: filtroTexto("Filtro por nome (contém)")` de `src/lib/openapi/helpers.ts` — apara espaços e trata `?nome=` vazio como ausente, sem 400 — → `ilike` com `escaparLike` no repository, aplicado só se o valor for truthy), relacionamento (`categoriaId: z.uuid().optional()` → `eq`), enum (`z.enum([...]).optional()`), booleano (`ativo: z.stringbool().optional()` — query string vem como texto).
   - **Filtro por data/intervalo**: dois params `de`/`ate` no formato `YYYY-MM-DD` (`z.iso.date().optional()`); o repository aplica `gte(x.createdAt, inicioDoDia(de))` e `lt(x.createdAt, diaSeguinte(ate))` (`src/lib/datas.ts`: meia-noite UTC do dia / do dia seguinte) — o fim é **exclusivo no dia seguinte** para incluir o dia inteiro sem depender de hora. Campo de data-hora exata (`z.iso.datetime()`) só quando o cliente realmente manda hora. Um só dos dois params é válido (intervalo aberto).
   - **`?incluir=`** para relações opcionais (referência: `papeis` — `incluir: z.enum(["permissoes"]).optional()`): a listagem devolve o registro magro por padrão e, com `incluir=permissoes`, o repository traz a relação numa segunda query em lote (`inArray` pelos ids da página) e monta o array em memória. É assim que a tela evita N+1 sem uma rota por relação.
   - Registre todos os paths (`registry.registerPath`) com os helpers de `src/lib/openapi/helpers.ts` (`ERROS`/`ERROS_LEITURA`/`ERROS_ESCRITA`, `ok/okLista/okPagina/criado/semConteudo`, `erro(...)`) e `security: SEGURANCA` (= `[{ sessionCookie: [] }]`, exportado de `src/lib/openapi/helpers.ts`) nas rotas autenticadas — `sessionCookie` é o security scheme registrado em `app.ts` (cookie de sessão do better-auth; não é bearer token).

2. **`<entidade>.repository.ts`** — classe; toda leitura filtra `isNull(x.deletedAt)`; `listar` com `orderBy` do mapa `SORT_COLUMNS` (allowlist → coluna Drizzle, nunca interpole nome de coluna) + desempate por `id`; `contar` separado; `alterar` usa `camposParaAtualizar` (lib/update.ts); `excluir` é **soft delete** (`.set({ deletedAt: new Date() })` — `ativo` é status de negócio via PATCH, não exclusão); `reativar` faz `.set({ deletedAt: null })`. Métodos que podem retornar nada declaram `Promise<X | undefined>` (o `[row]` do Drizzle não tipa isso sozinho).

3. **`<entidade>.service.ts`** — classe com `private repository = new XRepository()`; `listarPorId(id)` busca com `repository.porId` e lança `AppError("X não encontrado", 404)`; conflito de unicidade lança `AppError(..., 409)` com mensagem amigável; escrita em mais de uma tabela abre `db.transaction((tx) => ...)` e repassa `tx` aos repositories.
   - **`reativar`** (só para entidade com unique TOTAL, como `papeis.nome`; referência: `POST /papeis/{id}/reativar`): quando `criar` encontra o mesmo nome **excluído**, responde 409 com "reative-o em vez de criar outro"; o endpoint `POST /<entidades>/:id/reativar` (permissão `update`) limpa o `deletedAt` e devolve o registro (200). Entidade com unique parcial não precisa: criar de novo é permitido.
   - Arquivo (se houver): `lerArquivo(c)`/`lerDocumento(c)` no controller (`src/lib/storage/upload.ts`), `uploadToS3`/`downloadFromS3` no service. `uploadToS3` devolve a **URL pública** (`OBJECTS_PUBLIC_URL`), que só serve para bucket público; arquivo privado é entregue por proxy autenticado — `downloadFromS3(key)` no service + `respostaDeStream(obj)` no controller — e o cliente nunca fala com o bucket.

4. **`<entidade>.controller.ts`** — métodos arrow `async (c: AppContext) => ...`; validação com `safeParse` e, se falhar, `return respostaValidacao(c, parsed.error.issues)` (`src/lib/zod.ts`: 400 com `erros[]` de mensagens **e** `meta.campos` `{ campo: mensagem }` para o formulário marcar o input; aceita as issues de params + body concatenadas). Corpo com `await lerJson(c)`; listagem responde `successResponse(itens, { total, limit, offset })`; criação `c.json(..., 201)`.
   - **Status de escrita**: `POST` → 201 com o registro; `PATCH`/`PUT`/`reativar` → 200 com o registro atualizado; `DELETE` → **204 sem corpo** (`c.body(null, 204)`). Id inexistente **ou já excluído** → **404** em qualquer um deles (o service busca com `repository.porId` antes — que já filtra `deletedAt` — e trata o `undefined` que `alterar`/`excluir` devolvem se o registro sumir entre a leitura e o UPDATE): excluir duas vezes dá 204 e depois 404, nunca 204 silencioso.

5. **`<entidade>.routes.ts`** — `createRouter()`; `requireAuth` + `requirePermission("<acao>", "<Subject>")` por rota. Rotas de referência pública (combobox) ficam sem auth, como em `municipios.routes.ts`.

## Registros globais (TODOS obrigatórios)

1. **Módulo** em `src/modules/index.ts` — o ÚNICO ponto de montagem: importe o `<x>.routes.ts` e
   acrescente `{ path: "/<entidades>", routes }` em `MODULOS`, e importe `./<x>/<x>.schema.ts` por
   efeito colateral (é isso que põe o módulo no `/docs`). `src/routes/index.ts` e `app.ts` não mudam.
2. **CASL**: as permissões vivem no BANCO — adicione o par `{ acao, subject }` do módulo por papel em
   `PAPEIS_DEMO` (`src/seeds/papeis.ts`) e rode `bun run db:seed:papeis` (idempotente). Não altere
   `src/lib/casl/ability.ts`.
3. **Trigger de histórico**: a skill `design-models` termina com `bun run db:setup`, que já aplica a
   trigger em toda tabela com `deleted_at`; se a tabela foi criada por outro caminho (só `db:migrate`/`db:push`),
   rode `bun run db:triggers` — sem a trigger o módulo grava sem auditoria.
4. **Testes de integração**: a tabela nova entra em `TABELAS_DOMINIO` (`src/test/setup.ts`) — skill `testes-integracao`.

## Validação

```bash
cd backend
bun run typecheck && bun run openapi:export     # ou, na raiz: bun run check && bun run types
```

`bun run types` (raiz) regenera `backend/openapi.json` e `frontend/types/api.d.ts`; o CI (GitLab) acusa drift dos dois.
Service com regra (404/409/transição de estado/efeito colateral): cubra com a skill `testes-unitarios` e rode `bun run test`; contrato da rota contra o banco: skill `testes-integracao`.

## Depois da API

- Tela de listagem no painel: skill `data-table-pattern`.
- Formulários de criação/edição: skill `form-pattern`.

## Convenções

- Envelope de TODA resposta: `{ data, meta, erros }` (sucesso e erro).
- Paginação por `limit`/`offset`; `meta = { total, limit, offset }`.
- Ordenação: `sort=campo:asc|desc`, validada contra allowlist (injeção via ORDER BY não passa).
- Validação falha responde 400 com as issues em `erros[]` (+ `meta.campos`); JSON inválido vira 400 pelo `lerJson`; corpo sem `application/json` vira 415.
- Violação de unique do Postgres vira 409 automaticamente (errorHandler) — a checagem explícita no service existe para dar mensagem amigável.
- E-mail: use `sendEmail` (`src/lib/mail/fsmail.ts`) — envio direto ao FS-Mail; sem `FSMAIL_API_KEY`, só loga (dev).
