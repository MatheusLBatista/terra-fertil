---
name: teste-e2e
description: Teste ponta a ponta (Playwright) de um fluxo do painel que atravessa UI → API → banco — login, CRUD de uma entidade central, gate de permissão por papel. Roda com `cd frontend && bun run e2e` contra a API e o front no ar. Use ao criar ou revisar `frontend/e2e/tests/<fluxo>.e2e.ts` — "teste e2e de X", "testar o fluxo de X pela tela", "cobrir o cadastro de X de ponta a ponta". Regra de negócio isolada de um service é `testes-unitarios`; só aparência é `ui-verify`.
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
API e front no ar. Na raiz: `bun run db:up` → `bun run dev:api` → `bun run dev:front`
(banco zerado: `bun run db:reset`). Usa o Google Chrome instalado
(`channel: "chrome"` em `frontend/playwright.config.ts`); dependências no
`package.json` do front (`bun install` em `frontend/`).

Os testes entram como o **admin do seed** (`ADMIN`/`ADMIN_SENHA` em `helpers.ts`, default
`fslab.vilhena@ifro.edu.br` / `102030fs`). O e2e não lê o `backend/.env`: se lá estiverem
`ADMIN_EMAIL`/`ADMIN_PASSWORD` (o seed usa esses), rode com os mesmos em
`E2E_ADMIN_EMAIL`/`E2E_ADMIN_SENHA`:

```bash
cd frontend && E2E_ADMIN_EMAIL=admin@minhaempresa.com E2E_ADMIN_SENHA='…' bun run e2e
```

Qualquer outro papel é **conta temporária criada pela API do admin**
(`criarUsuario(admin, { email: emailUnico("e2e-x"), papel })`) e removida no fim
(`removerUsuario`) — as contas demo `gestor@`/`usuario@example.com` podem ter sido
banidas ou trocadas de papel na tela; nenhum teste depende delas.

## Como rodar

```bash
cd frontend
bun run e2e                       # tudo
bun run e2e --grep "Usuários"     # um describe/teste (regex; o bun repassa os args — `--` é opcional)
bun run e2e tests/senha.e2e.ts    # um arquivo
bun run e2e:ui                    # modo UI (passo a passo, DOM ao vivo)
bun run check                     # antes, no front: typecheck + lint + format:check
```

Da **raiz** do repositório, `bun run e2e` (e `bun run e2e --grep "X"`) é o mesmo que
`cd frontend && bun run e2e` — o script da raiz faz `bun run --cwd frontend e2e`. Já
`bunx playwright …` direto só funciona dentro de `frontend/` (a raiz não tem `node_modules`).
O `bun run check` **da raiz** cobre back + front (typecheck, testes unitários e lint do back;
typecheck e lint do front); o de `frontend/` é só do front e inclui o `format:check`.

Saída: lista no terminal; falha deixa print, `error-context.md` (snapshot ARIA)
e `trace.zip` em `frontend/e2e/.resultados/<teste>/`.

## Layout

```
frontend/
  playwright.config.ts        projetos `ui-verify` e `e2e` (viewport 1280×800, 1 worker, trace on failure)
  e2e/
    ui-verify.spec.ts         prints/overflow/axe (skill ui-verify) — não é e2e
    tests/
      helpers.ts              test (fixture), ADMIN/ADMIN_SENHA, login, apiLogin, apiFetch,
                              criarUsuario/buscarUsuario/removerUsuario, nomeUnico/emailUnico,
                              menu, toast, verEDispensarToast
      login.e2e.ts            senha errada (erro ligado aos campos) / certa / sair / volta ao `next`
      papeis.e2e.ts           CRUD completo — o exemplo de referência — e editor de permissões
      usuarios.e2e.ts         admin: criar, editar, banir/desbanir, trocar papel (confirmação), remover
      permissoes.e2e.ts       gate por papel (tela + API), contas temporárias usuario e gestor
      senha.e2e.ts            trocar a própria senha (erro no campo; entra com a nova)
```

Fluxo novo = `e2e/tests/<fluxo>.e2e.ts`, importando `test` de `./helpers`
(o `test` do helper esconde o botão flutuante do Next Dev Tools, que em dev
cobre o rodapé dos sheets).

## Padrões

- **Login pela tela, dados pela API.** `login(page, email?)` preenche `/login`
  e espera `/dashboard` — é o caminho do usuário. `apiLogin()` devolve o cookie
  de sessão para `apiFetch(path, init, cookie)`: preparar dados, conferir estado
  no servidor e limpar. Um teste que só usa a API não é e2e.
- **Nome único por execução**: `nomeUnico("e2e")` → `e2e-<base36>` (timestamp +
  sufixo aleatório); serve de slug (`papeis.nome`) e de chave para achar/limpar o
  registro. Para contas, `emailUnico("e2e-x")` → `e2e-x-<base36>@example.com`.
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
  `toHaveCount(0)`; estado que a tela aplica otimista e a API grava depois,
  `expect.poll(() => lerNaApi()).toBe(…)`. Se um `waitForTimeout` for inevitável
  (animação do base-ui), deixe o comentário dizendo qual.
- **Toast por cima da tabela**: o toast (canto superior direito) cobre a coluna
  Ações das primeiras linhas e o clique seguinte espera ele sumir sozinho (~5s).
  Quando o próximo passo é um botão da linha, use `verEDispensarToast(page, texto)`
  (confere e fecha).
- **Cada teste é independente**: faz o próprio login, cria o próprio dado,
  limpa o próprio dado; a ordem de execução não importa (1 worker é só para
  não disputar o banco).

## Guardrails

- O banco é o de dev de quem está desenvolvendo: o teste cria e apaga **só os
  registros com o seu nome único**. Reset/drop de tabela fica fora do e2e.
- Seletor de CSS (classe, `data-slot`) quebra ao restilizar; role/label é o
  contrato com o usuário.
- As contas demo `gestor@`/`usuario@example.com` podem estar banidas ou com
  outro papel: papel específico pede conta temporária (`criarUsuario`) removida
  pelo teste (`removerUsuario` no `afterEach`/`afterAll`).
- Admin com credenciais fora do default: `E2E_ADMIN_EMAIL`/`E2E_ADMIN_SENHA` —
  nunca escreva outra senha no código do teste.

## Depurar

1. Leia `error-context.md` do teste que falhou: é o snapshot ARIA da página
   no momento da falha — mostra o que o seletor viu (ou não viu).
2. `cd frontend && bunx playwright show-trace e2e/.resultados/<teste>/trace.zip` —
   linha do tempo com DOM, rede e console de cada passo.
3. `bun run e2e:ui` para rodar passo a passo com o DOM ao vivo.
4. "subtree intercepts pointer events" = algo por cima do alvo (overlay, sheet
   fechando, dev tools). Espere o overlay sumir ou restrinja o seletor; não use
   `force: true`.

## Exemplo (de `papeis.e2e.ts`, primeiro teste)

```ts
import { expect } from "@playwright/test";
import { apiFetch, apiLogin, login, nomeUnico, toast, type Envelope, test } from "./helpers";

type Papel = { id: string; nome: string; descricao: string | null };

test.describe("Papéis — CRUD pela tela", () => {
  let cookie: string;
  let nome: string;

  const buscarPorNome = async () => {
    const r = await apiFetch(`/papeis?nome=${encodeURIComponent(nome)}`, {}, cookie);
    expect(r.status).toBe(200);
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
    // ── Criar ──
    await page.getByRole("button", { name: "Novo papel" }).click();
    const novo = page.getByRole("dialog", { name: "Novo papel" });
    await novo.getByLabel("Nome", { exact: true }).fill(nome);
    await novo.getByLabel("Descrição", { exact: true }).fill("Criado pelo e2e");
    await novo.getByRole("button", { name: "Criar", exact: true }).click();

    await expect(toast(page, "Papel criado.")).toBeVisible();
    const linha = page.getByRole("row").filter({ hasText: nome });
    await expect(linha).toContainText("Criado pelo e2e");
    const criado = await buscarPorNome();                        // UI → API
    expect(criado).toMatchObject({ nome, descricao: "Criado pelo e2e" });
    const id = criado!.id;

    // ── Editar ──
    await linha.getByRole("button", { name: `Editar ${nome}`, exact: true }).click();
    const editar = page.getByRole("dialog", { name: "Editar papel" });
    await expect(editar.getByLabel("Nome", { exact: true })).toHaveValue(nome);
    await editar.getByLabel("Descrição", { exact: true }).fill("Editado pelo e2e");
    await editar.getByRole("button", { name: "Salvar", exact: true }).click();

    await expect(toast(page, "Papel atualizado.")).toBeVisible();
    const detalhe = await apiFetch(`/papeis/${id}`, {}, cookie);  // GET por id após editar
    expect(detalhe.status).toBe(200);
    const { data: editado } = (await detalhe.json()) as Envelope<Papel & { permissoes: unknown[] }>;
    expect(editado).toMatchObject({ id, nome, descricao: "Editado pelo e2e", permissoes: [] });

    // ── Excluir (ConfirmacaoDialog) ──
    await linha.getByRole("button", { name: `Excluir ${nome}`, exact: true }).click();
    const confirmacao = page.getByRole("alertdialog");
    await expect(confirmacao).toContainText(nome);
    await confirmacao.getByRole("button", { name: "Excluir", exact: true }).click();

    await expect(toast(page, "Papel excluído.")).toBeVisible();
    await expect(linha).toHaveCount(0);
    expect((await apiFetch(`/papeis/${id}`, {}, cookie)).status).toBe(404);  // soft delete some da leitura
    expect(await buscarPorNome()).toBeUndefined();
  });
});
```

Contas temporárias (de `permissoes.e2e.ts`): criadas no `beforeAll`, removidas no `afterAll`.

```ts
const usuario = emailUnico("e2e-usuario");
test.beforeAll(async () => {
  admin = await apiLogin();
  await criarUsuario(admin, { email: usuario, papel: "usuario" });
});
test.afterAll(async () => { await removerUsuario(admin, usuario); });
// no teste: await login(page, usuario); … expect((await apiFetch("/papeis", {}, await apiLogin(usuario))).status).toBe(403);
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
- [ ] `cd frontend && bun run e2e` verde, rodado duas vezes seguidas (prova a limpeza)
