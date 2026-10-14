---
name: testes-integracao
description: Teste de integração (vitest + Postgres de teste) das rotas de um módulo do back-end pela API — `app.request()` do Hono sem servidor, login real pelo better-auth, envelope, gates 401/403, allowlist de sort, soft delete + unique, trigger de histórico. Use ao criar ou revisar `<entidade>.integration.test.ts` — "teste de integração de X", "testar as rotas de X", "cobrir o CRUD de X contra o banco".
---

# testes-integracao — rotas de verdade, banco de verdade, sem servidor

Exemplos reais e completos: `backend/src/modules/papeis/papeis.integration.test.ts`
(ciclo de vida de um módulo) e `backend/src/app.integration.test.ts` (contratos
transversais). Leia o primeiro antes de escrever o seu; tudo abaixo deriva dele.

## Qual teste escrever

| Pergunta | Skill |
|---|---|
| O **service** decide algo (404/409, transação, cache, e-mail) e dá para provar com o repository mockado? | `testes-unitarios` — rápido, sem banco |
| A regra só existe **no banco ou na cadeia HTTP** — unique/FK, trigger, soft delete filtrando leituras, `requireAuth`/`requirePermission`, parse de query/body, envelope, ordenação por coluna real? | **esta skill** |
| O fluxo atravessa a **tela** (UI → API → banco) e o que importa é o que o usuário vê? | `teste-e2e` (Playwright) |

Regra prática: unitário para a decisão, integração para o contrato da rota e o
comportamento do banco, e2e só para os fluxos críticos da tela. Não repita a
mesma regra nos três níveis.

## Pré-requisitos e como rodar

- Postgres de teste no ar (uma vez): `cd backend && docker compose -p template-ia-dev --env-file .env -f docker-compose.yml up -d db_test`
  (serviço `db_test`, porta `POSTGRES_PORT_TEST`, padrão 5434, dados em `backend/data/postgres-test`).
- `DATABASE_URL_TEST` no `.env` só se você mudou porta/credenciais; o padrão é
  `postgresql://user_template:102030fs@localhost:5434/db_template_test`. O nome do
  banco PRECISA conter `test` — o setup recusa outro (ele dropa o schema).
- `cd backend && npm run test:integration` (só integração) · `npm run test:all`
  (unitários + integração) · `npm test` continua sendo só os unitários.
- Na raiz: `make dev-test-integration` / `make dev-test-all`. `make check` **não** inclui
  integração (não depende de banco) — rode-a à parte antes de commitar um módulo novo.
- No CI (`.github/workflows/ci.yml`) o Postgres é um service container com as
  mesmas credenciais — nada a configurar.

O que acontece a cada rodada (`src/test/globalSetup.ts`, uma vez por processo):
`DATABASE_URL` é apontada para o banco de teste **antes** de qualquer import de
`src/`, o schema `public` é recriado do zero, `drizzle-kit migrate` (se existe
`drizzle/meta/_journal.json`) ou `push --force`, trigger `trg_historico`, seeds de
papéis e usuários. Os seeds do IBGE ficam de fora (lentos): se o teste precisa de
estados/municípios, importe `seedEstados`/`seedMunicipios` no seu `beforeAll`.

## Arquivo e nome

- `<entidade>.integration.test.ts` ao lado do módulo (`vitest.config.ts`, projeto
  `integration`, inclui `src/**/*.integration.test.ts`; o projeto `unit` os exclui).
- Arquivos rodam **em série** (`fileParallelism: false`) — compartilham o banco.
  Dentro do arquivo, os `it` rodam na ordem escrita: um ciclo de vida encadeado
  (criar → alterar → excluir → histórico) é aceitável e é o padrão do exemplo.
- Timeout de 30 s por teste; login uma vez por arquivo no `beforeAll`.

## Padrão: `app.request()` + helpers de `src/test/http.ts`

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { comCookie, anonima, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

let cookie: string;
beforeAll(async () => { cookie = await login("admin@example.com"); });

const res = await app.request("/papeis", comCookie(cookie, { method: "POST", json: { nome } }));
const corpo = await json<PapelResposta>(res);   // { data, meta, erros } tipado
```

- `login(email, senha?)` → `POST /auth/sign-in/email` e devolve o header `Cookie`
  pronto; a senha das contas do seed (`admin@`, `gestor@`, `usuario@example.com`)
  é resolvida sozinha. Outra conta: crie-a no `beforeAll` e passe a senha.
- `comCookie(cookie, init)` / `anonima(init)` — montam o `RequestInit` com
  `Origin: http://localhost:3000` (TRUSTED_ORIGINS: better-auth e CORS validam a
  origem como o navegador faria). `json:` serializa o corpo e põe o Content-Type;
  `body:` é o corpo cru (JSON inválido, corpo > 1 MB).
- Nada de `vi.mock` aqui: o valor do teste é passar por Hono → middleware →
  controller → service → repository → Postgres de verdade.
- Para provar o estado do banco (soft delete, trigger), consulte com `db` do
  Drizzle no próprio teste — não crie endpoints só para o teste.

## O que cobrir num módulo novo

1. **Gates**: `401` sem cookie; `403` com `usuario@example.com` (papel sem a
   permissão) — prova que a rota tem `requireAuth` + `requirePermission` e que a
   permissão está no seed de papéis.
2. **Envelope** em sucesso e erro: `toEqual({ data, meta, erros })` — inclusive
   `meta: { total, limit, offset }` na listagem e `erros: ["mensagem"]` no 4xx.
3. **Criar** (201) com o corpo mínimo e com relacionamentos; **validação** (400)
   com um campo inválido — a mensagem vem de `mapearIssues`. (JSON inválido → 400,
   corpo sem `application/json` → 415 e corpo > 1 MB → 413 já estão cobertos
   uma vez em `app.integration.test.ts`; não repita por módulo.)
4. **Conflito** (409) — o mesmo nome/chave natural de novo.
5. **Alterar** (PATCH) preserva o que não foi enviado; sub-recursos (`PUT
   /:id/xyz`) substituem o conjunto e o `GET /:id` confirma a persistência.
6. **Ordenação**: `?sort=campo:desc` respeita a ordem; campo fora da allowlist →
   400 `"Campo de ordenação inválido"`. Compare a ordem **relativa** de nomes
   conhecidos, não `nomes.sort()` do JS (collation do Postgres difere em hífen,
   dígitos e acentos).
7. **Soft delete**: `DELETE` 204 → `GET /:id` 404 → a linha continua no banco com
   `deletedAt`; se a chave é unique total (caso de `papeis.nome`), criar de novo
   → 409 com a mensagem de "reative".
8. **Trigger**: `historico_alteracoes` filtrado por `tabela` + `registro_id` tem
   `["INSERT", "UPDATE", "DELETE"]` e `alteradoPor` = id do usuário logado — prova
   o AsyncLocalStorage das colunas de auditoria de ponta a ponta.

## Higiene dos dados (`src/test/setup.ts`)

- Tabelas de **domínio** (as suas entidades) entram na lista `TABELAS_DOMINIO` e
  são truncadas antes e depois de cada arquivo. Adicione a sua tabela lá ao criar
  o módulo — é o único registro global desta skill.
- Tabelas de **referência semeadas** (`papeis`, `permissoes`, `user`, `estados`,
  `municipios`) nunca são truncadas. Registro criado nelas usa nome com
  `PREFIXO_TESTE` (`teste-`) + sufixo aleatório (`randomUUID().slice(0, 8)`), e o
  arquivo remove o seu no `afterAll` (hard delete via `db.delete`).
- `historico_alteracoes` é log append-only: não limpe; filtre por `registro_id`.
- Não altere os papéis/usuários do seed (renomear `admin` quebra os outros
  arquivos). Precisa de um papel com permissões específicas? Crie um `teste-*`.
- Determinístico: sem `Date.now()` em asserção (use `expect.any(Date)`/
  `expect.any(String)`), sem depender de dados que outro arquivo criou.

## Exemplo compacto (de `papeis.integration.test.ts`)

```ts
const NOME = `${PREFIXO_TESTE}${randomUUID().slice(0, 8)}`;
let cookie: string; let id: string;

beforeAll(async () => { cookie = await login("admin@example.com"); });
afterAll(async () => { await db.delete(papel).where(eq(papel.nome, NOME)); });

it("POST /papeis cria o papel com permissões (201)", async () => {
  const res = await app.request("/papeis", comCookie(cookie, {
    method: "POST",
    json: { nome: NOME, permissoes: [{ acao: "read", subject: "Papel" }] },
  }));
  expect(res.status).toBe(201);
  const corpo = await json<PapelResposta>(res);
  expect(corpo.data).toEqual({ id: expect.any(String), nome: NOME, descricao: null,
    permissoes: [{ acao: "read", subject: "Papel" }] });
  id = corpo.data.id;
});

it("POST /papeis com o mesmo nome responde 409", async () => {
  const res = await app.request("/papeis", comCookie(cookie, { method: "POST", json: { nome: NOME } }));
  expect(res.status).toBe(409);
  expect(await json(res)).toEqual({ data: [], meta: {}, erros: [`Já existe um papel "${NOME}"`] });
});

it("DELETE faz soft delete (204) e o GET passa a responder 404", async () => {
  expect((await app.request(`/papeis/${id}`, comCookie(cookie, { method: "DELETE" }))).status).toBe(204);
  expect((await app.request(`/papeis/${id}`, comCookie(cookie))).status).toBe(404);
});

it("trigger registrou INSERT/UPDATE/DELETE com o usuário da sessão", async () => {
  const linhas = await db.select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
    .from(historicoAlteracao)
    .where(and(eq(historicoAlteracao.tabela, "papeis"), eq(historicoAlteracao.registroId, id)))
    .orderBy(asc(historicoAlteracao.id));
  expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "DELETE"]);
});
```

## Checklist

- [ ] Arquivo `<entidade>.integration.test.ts` ao lado do módulo; login uma vez no `beforeAll`
- [ ] 401 sem cookie e 403 com `usuario@example.com` em pelo menos uma rota
- [ ] Envelope completo (`toEqual`) em um sucesso e em um erro de cada status usado
- [ ] 201 / 400 / 409 / PATCH / sort válido e inválido / DELETE 204 → 404
- [ ] Linha do histórico com `INSERT`, `UPDATE`, `DELETE` e `alteradoPor` do usuário logado
- [ ] Tabela nova em `TABELAS_DOMINIO` (setup.ts); nomes com `PREFIXO_TESTE` em tabelas semeadas + `afterAll`
- [ ] Nenhum `vi.mock`; nenhum servidor/porta; `Origin` vai pelos helpers
- [ ] `npm run test:integration`, `npm run typecheck` e `npm run test:all` verdes
