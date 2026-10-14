---
name: teste-e2e
description: Teste ponta a ponta (Playwright) de um fluxo do painel que atravessa UI → API → banco — login, CRUD de uma entidade central, gate de permissão por papel. Roda com `cd frontend && npm run e2e` contra a API e o front no ar. Use ao criar ou revisar `frontend/e2e/tests/<fluxo>.e2e.ts` — "teste e2e de X", "testar o fluxo de X pela tela", "cobrir o cadastro de X de ponta a ponta". Regra de negócio isolada de um service é `testes-unitarios`; só aparência é `ui-verify`.
---

# teste-e2e — fluxo de ponta a ponta no painel

Um e2e prova que **a jornada do usuário funciona de verdade**: clica na tela,
a API grava, o banco reflete. Escreva um quando o fluxo cruza as três camadas
e quebrar dói: login, CRUD de entidade central, gate de permissão. Regra de
negócio de um service (404/409, transições) é `testes-unitarios`; layout e
acessibilidade é `ui-verify`.

Uma suíte pequena e sempre verde vale mais que uma grande e instável: cubra
o caminho feliz e a recusa principal de cada fluxo, não cada variação.

## Pré-requisitos

Não existe banco de teste: os e2e rodam contra o **banco de dev semeado**, com
API e front no ar. Na raiz: `make dev-infra-up` → `make dev-api` → `make dev-front`
(banco zerado: `make dev-db-reset`). Usa o Google Chrome instalado
(`channel: "chrome"` em `frontend/playwright.config.ts`); dependências no
`package.json` do front (`npm install` em `frontend/`).

Usuários do seed: `admin@example.com`, `gestor@example.com`, `usuario@example.com`,
senha `102030fs`. Se o teste precisa de um papel específico, **crie a conta pela
API do admin** (`/auth/admin/create-user`) e remova no fim — a conta demo pode
ter sido banida ou alterada na tela.

## Como rodar

```bash
cd frontend
npm run e2e                       # tudo
npm run e2e -- --grep "Papéis"    # um describe/teste
npm run e2e:ui                    # modo UI (passo a passo, DOM ao vivo)
make e2e                          # na raiz, mesmo que npm run e2e
make check                        # antes: typecheck + lint (back e front) — o e2e não substitui
```

Saída: lista no terminal; falha deixa print, `error-context.md` (snapshot ARIA)
e `trace.zip` em `frontend/e2e/.resultados/<teste>/`.

## Layout

```
frontend/
  playwright.config.ts        projetos `ui-verify` e `e2e` (viewport 1280×800, 1 worker, trace on failure)
  e2e/
    ui-verify.spec.ts         prints/overflow/axe (skill ui-verify) — não é e2e
    tests/
      helpers.ts              test (fixture), login, apiLogin, apiFetch, nomeUnico, menu, toast
      login.e2e.ts            senha errada / certa / sair
      papeis.e2e.ts           CRUD completo — o exemplo de referência
      permissoes.e2e.ts       gate por papel (tela + API)
```

Fluxo novo = `e2e/tests/<fluxo>.e2e.ts`, importando `test` de `./helpers`
(o `test` do helper esconde o botão flutuante do Next Dev Tools, que em dev
cobre o rodapé dos sheets).

## Padrões

- **Login pela tela, dados pela API.** `login(page, email?)` preenche `/login`
  e espera `/dashboard` — é o caminho do usuário. `apiLogin()` devolve o cookie
  de sessão para `apiFetch(path, init, cookie)`: preparar dados, conferir estado
  no servidor e limpar. Um teste que só usa a API não é e2e.
- **Nome único por execução**: `nomeUnico("e2e")` → `e2e-<base36>`; serve de
  slug (`papeis.nome`) e de chave para achar/limpar o registro.
- **Limpeza em `afterEach` pela API**, procurando pelo nome único e apagando
  se ainda existir — cobre o caso em que o teste falhou antes do DELETE. O
  banco termina como começou.
- **Seletores acessíveis**: `getByRole`, `getByLabel`, `getByText`, com
  `{ exact: true }` quando o texto é curto. Sheet = `getByRole("dialog", { name })`,
  `ConfirmacaoDialog` = `getByRole("alertdialog")`, toast = `toast(page, texto)`,
  menu lateral = `menu(page)`. Quando uma role resolve em dois elementos
  (menu + breadcrumb), restrinja pelo landmark em vez de afrouxar o seletor.
- **Depois de cada ação na tela, confira na API**: `GET /papeis?nome=` após
  criar, `GET /papeis/:id` após editar, `404` após excluir. A tela pode mentir
  (cache, toast otimista); a API não.
- **Ids vêm da resposta da API** no próprio teste, nunca escritos à mão.
- **Espere por estado**: `expect(...).toBeVisible()`, `waitForURL`,
  `toHaveCount(0)`. Se um `waitForTimeout` for inevitável (animação do base-ui),
  deixe o comentário dizendo qual.
- **Cada teste é independente**: faz o próprio login, cria o próprio dado,
  limpa o próprio dado; a ordem de execução não importa (1 worker é só para
  não disputar o banco).

## Guardrails

- O banco é o de dev de quem está desenvolvendo: o teste cria e apaga **só os
  registros com o seu nome único**. Reset/drop de tabela fica fora do e2e.
- Seletor de CSS (classe, `data-slot`) quebra ao restilizar; role/label é o
  contrato com o usuário.
- A conta demo `usuario@example.com` pode estar banida: papel específico
  pede conta temporária criada e removida pelo teste.

## Depurar

1. Leia `error-context.md` do teste que falhou: é o snapshot ARIA da página
   no momento da falha — mostra o que o seletor viu (ou não viu).
2. `npx playwright show-trace frontend/e2e/.resultados/<teste>/trace.zip` —
   linha do tempo com DOM, rede e console de cada passo.
3. `npm run e2e:ui` para rodar passo a passo com o DOM ao vivo.
4. "subtree intercepts pointer events" = algo por cima do alvo (overlay, sheet
   fechando, dev tools). Espere o overlay sumir ou restrinja o seletor; não use
   `force: true`.

## Exemplo (de `papeis.e2e.ts`)

```ts
import { expect } from "@playwright/test";
import { apiFetch, apiLogin, login, nomeUnico, toast, test, type Envelope } from "./helpers";

type Papel = { id: string; nome: string; descricao: string | null };

test.describe("Papéis — CRUD pela tela", () => {
  let cookie: string;
  let nome: string;

  const buscarPorNome = async () => {
    const r = await apiFetch(`/papeis?nome=${encodeURIComponent(nome)}`, {}, cookie);
    const { data } = (await r.json()) as Envelope<Papel[]>;
    return data.find((p) => p.nome === nome);
  };

  test.beforeAll(async () => { cookie = await apiLogin(); });
  test.beforeEach(async ({ page }) => {
    nome = nomeUnico("e2e");
    await login(page);
    await page.goto("/papeis");
  });
  test.afterEach(async () => {                       // limpeza mesmo se o teste falhou no meio
    const sobra = await buscarPorNome();
    if (sobra) await apiFetch(`/papeis/${sobra.id}`, { method: "DELETE" }, cookie);
  });

  test("cria, edita e exclui um papel", async ({ page }) => {
    await page.getByRole("button", { name: "Novo papel" }).click();
    const novo = page.getByRole("dialog", { name: "Novo papel" });
    await novo.getByLabel("Nome", { exact: true }).fill(nome);
    await novo.getByLabel("Descrição", { exact: true }).fill("Criado pelo e2e");
    await novo.getByRole("button", { name: "Criar", exact: true }).click();

    await expect(toast(page, "Papel criado.")).toBeVisible();
    const linha = page.getByRole("row").filter({ hasText: nome });
    await expect(linha).toBeVisible();

    const criado = await buscarPorNome();                       // UI → API
    expect(criado).toMatchObject({ nome, descricao: "Criado pelo e2e" });
    const id = criado!.id;

    await linha.getByRole("button", { name: `Excluir ${nome}`, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(linha).toHaveCount(0);
    expect((await apiFetch(`/papeis/${id}`, {}, cookie)).status).toBe(404);   // soft delete some da leitura
  });
});
```

## Checklist

- [ ] O fluxo cruza UI → API → banco (senão é `testes-unitarios` ou `ui-verify`)
- [ ] Arquivo em `frontend/e2e/tests/<fluxo>.e2e.ts`, `test` importado de `./helpers`
- [ ] Login pela tela (`login`); API só para setup, asserção e limpeza
- [ ] Dados com `nomeUnico`; ids lidos da resposta da API
- [ ] `afterEach` apaga pela API o que sobrou
- [ ] Só `getByRole` / `getByLabel` / `getByText`; role duplicada → restringir pelo landmark
- [ ] Cada ação na tela conferida na API
- [ ] Sem `waitForTimeout` (ou comentado com a animação que espera)
- [ ] `cd frontend && npm run e2e` verde, rodado duas vezes seguidas (prova a limpeza)
