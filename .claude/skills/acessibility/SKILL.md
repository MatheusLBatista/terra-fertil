---
name: acessibility
description: Revisão de acessibilidade (WAI-ARIA, WCAG 2 A/AA) de uma tela do painel (frontend/) — roda o axe do ui-verify e depois cobre o que o axe não pega: teclado e foco visível, foco preso/devolvido em Sheet e AlertDialog, nomes acessíveis de botões só com ícone, aria-sort, role=status/aria-live, erros de formulário ligados ao campo, landmarks, contraste nos dois temas, movimento reduzido. Use ao criar ou revisar uma tela — "acessibilidade de X", "leitor de tela", "navegação por teclado", "WCAG", "aria".
---

# acessibility — revisão WAI-ARIA de uma tela

O axe (via `ui-verify`) pega o mecânico: label ausente, contraste de texto sobre fundo sólido,
`aria-*` inválido, região rolável sem foco. O resto — ordem de foco, o que o Esc faz, o que o
leitor de tela anuncia — é revisão manual. Esta skill é o roteiro dessa revisão neste codebase.

## Procedimento

1. **axe** (front e API no ar):
   ```bash
   cd frontend && CHECAR=axe ROTAS=/rota npm run ui:verify     # só acessibilidade
   cd frontend && CHECAR=axe TEMA=light ROTAS=/rota npm run ui:verify
   ```
   Prints em `frontend/e2e/prints`. Corrija cada violação na origem (regra nunca é suprimida);
   itens *incomplete* (fundo semitransparente como `bg-destructive/10`, `bg-input/30`) entram na
   conferência de contraste do passo 4.
2. **Teclado, sem mouse**, na rota inteira:
   - `Tab`/`Shift+Tab`: a ordem segue a leitura (sidebar → cabeçalho → filtros → tabela → rodapé);
     todo controle focado mostra anel (`focus-visible:ring`); nada focável está escondido.
   - `Enter`/`Space` acionam botões; `Enter` num `<input>` de formulário pula ao próximo campo e só
     no último submete (`EnterFieldNavigation`); `Esc` fecha Sheet/AlertDialog/combobox.
   - Sheet e AlertDialog: ao abrir, o foco entra no painel (primeiro campo ou botão); `Tab` circula
     só dentro dele; ao fechar, o foco **volta ao botão que abriu**.
   - Combobox (`Seletor`): setas ↑/↓ percorrem a lista, `Enter` seleciona, `Esc` fecha sem escolher;
     o botão "Limpar seleção" é alcançável por `Tab`.
   - Tabela: cabeçalho ordenável é um botão (`Enter` alterna); container rola com ←/→ quando focado.
3. **Nomes e anúncios** (árvore de acessibilidade do DevTools, ou `getByRole` no Playwright):
   - Botão só com ícone tem nome (`aria-label`) que inclui o registro: "Editar ana@…", não "Editar".
   - Cabeçalho ordenado expõe `aria-sort`; a página tem um `h1`; toasts e loading são anunciados.
4. **Contraste nos dois temas** (`TEMA=light` e dark): texto `text-muted-foreground` sobre
   `bg-muted`, badges `variant="destructive"`/`outline`, botões `variant="link"` e `ghost` em hover.
5. **Movimento**: com "reduzir movimento" ligado no SO, animações de entrada de Sheet/AlertDialog e
   `animate-ping`/`animate-spin` não devem rodar (ou ficam instantâneas).
6. Relate o que passou e o que ficou pendente; corrija na tela, nunca com `aria-hidden` para
   "silenciar" um problema.

## O que o axe não cobre — e onde está neste código

| Item | Como está no template | O que verificar na tela nova |
|---|---|---|
| Foco visível | `Button`, `Input`, `NativeSelect`, `Textarea`, `Checkbox`, `Switch`, `Tabs` trazem `focus-visible:ring-1 ring-ring/50` (`components/ui/*`); anel azul `--ring` nos dois temas; os botões crus do rodapé do sidebar (`BOTAO_RODAPE` em `app-sidebar.tsx`) levam `focus-visible:ring-1 ring-sidebar-ring` | `<button>`/`<a>` crus precisam de `focus-visible:ring-*` ou virar `Button variant="ghost"` |
| Foco preso e devolvido | base-ui `Dialog`/`AlertDialog` (Sheet, `Dialog` do `TrocarSenhaDialog`, ConfirmacaoDialog): `modal`, foco inicial no primeiro tabbable (`initialFocus`), `finalFocus` de volta ao trigger, Esc fecha | Confirmar que o botão de origem recebe o foco ao fechar; sem `autoFocus` manual; nunca um portal à mão |
| Nome de botão só com ícone | Coluna Ações: `aria-label={`Editar ${nome}`}` (`usuarios`, `papeis`); editor de permissões: "Ação/Subject/Remover permissão N" (`papeis`); combobox: "Abrir opções"/"Limpar seleção" (`ui/combobox.tsx`); `ScrollToTop`: "Voltar ao topo"; sidebar: "Trocar senha", "Sair", "Alternar tema", "Abrir ou fechar o menu" | Todo `size="icon*"` com `aria-label` em pt-BR e específico ao registro (linhas repetidas levam o índice); `title` sozinho é fallback fraco |
| `aria-sort` | `<TableHead aria-sort={…}>` só em coluna com `getCanSort()` (`data-table-pattern`) | Coluna não ordenável fica `undefined`, nunca `"none"` |
| Loading e toasts | `Loading.tsx` e `Spinner` = `role="status" aria-label="Carregando"`; react-toastify põe `role="alert"` em cada toast (pausa no hover/foco por padrão); `AmbientePill` = `role="status"`; toda listagem tem `aria-busy={consulta.isPending}` no wrapper `div.border` da tabela | Linhas de `Skeleton` não anunciam nada sozinhas: mantenha o `aria-busy` no wrapper (e, se a tela demora, um `sr-only` em `role="status"`) |
| Erros de formulário | `Input`/`Textarea`/`NativeSelect` pintam por `aria-invalid`; `usuarios`, `definir-senha` e `trocar-senha-dialog` ligam o `<p id="…-erro" role="alert">` por `aria-describedby`; `login` usa `<p role="alert">` para erro de OAuth | `aria-invalid` **e** `<p id="x-erro">` referenciado por `aria-describedby` (skill `form-pattern`); lista de `erros[]` da API em `role="alert"` |
| `<label htmlFor>` | Todos os formulários (`usuarios`, `papeis`, `login`, `definir-senha`) usam `Label htmlFor` + `id`; filtros sem label visível usam `aria-label` | Campo sem `<Label>` visível leva `aria-label`; nunca só `placeholder` |
| Landmarks | `SidebarInset` = `<main>`; menu do sidebar em `<nav aria-label="Menu principal">` (`app-sidebar.tsx`); `PageLayout` = `<header>` + um `h1` por tela; `DataPagination` = `<nav aria-label="Paginação">`; breadcrumb = `<nav aria-label="breadcrumb">` | Título via `PageLayout title` (não crie outro `h1`); seções grandes com `aria-labelledby` |
| Região rolável focável | `ui/table.tsx`: wrapper com `tabIndex={0}` + `focus-visible:ring` (regra `scrollable-region-focusable`) | Outro container `overflow-auto` com conteúdo maior que a área precisa do mesmo |
| Texto alternativo da marca | `Logo` = `<svg aria-hidden="true">` com texto "Template IA" ao lado (`AuthShell`, sidebar); sidebar recolhido: `Link aria-label="Ir para o dashboard"`; ícones lucide são `aria-hidden` por padrão | Ícone phosphor (sidebar) **não** é `aria-hidden` por padrão — dentro de botão com `aria-label` está ok, solto precisa de `aria-hidden` |
| Idioma | `app/layout.tsx`: `<html lang="pt-BR">`; textos `sr-only` dos componentes shadcn traduzidos ("Fechar", "Abrir ou fechar o menu", "Menu") | Trechos em outro idioma levam `lang` próprio; componente novo do shadcn chega com `sr-only` em inglês — traduza |
| Movimento reduzido | Regra global em `globals.css` (`@media (prefers-reduced-motion: reduce)` zera animação e transição de tudo — cobre Sheet/AlertDialog/Select/Tooltip); `ScrollToTop` lê a media query (`scrollTo` sem `smooth`); `AmbientePill` usa `motion-reduce:animate-none` | Animação por JS (`scrollTo`, `requestAnimationFrame`) não é coberta pelo CSS: leia a media query como o `ScrollToTop` |
| Skip link | `app/(auth)/layout.tsx`: "Pular para o conteúdo" (`sr-only focus:not-sr-only`) antes do sidebar, alvo `id="conteudo"` no `<main>` | Layout novo fora de `(auth)` (ex.: área pública com menu) repete o padrão |

## Componentes base-ui/shadcn usados aqui e o ARIA que já entregam

Verificado em `node_modules/@base-ui/react@1.8.0`:

| Componente (`components/ui`) | Primitivo | ARIA/comportamento incluído |
|---|---|---|
| `Sheet` | `Dialog` | `role="dialog"`, `aria-labelledby`→`SheetTitle`, `aria-describedby`→`SheetDescription`, modal (foco preso, fora inerte), Esc, foco devolvido ao trigger; botão fechar com `sr-only` |
| `AlertDialog` / `ConfirmacaoDialog` | `AlertDialog` | `role="alertdialog"`, título/descrição ligados, modal, Esc; `AlertDialogCancel` é `Close` |
| `Combobox` / `Seletor` | `Combobox` | `role="combobox"` no input com `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete`; lista `role="listbox"`, itens `role="option"` + `aria-selected`; setas/Enter/Esc |
| `Select` | `Select` | trigger `role="combobox"` + `aria-haspopup`/`aria-expanded`; `listbox`/`option`; navegação por teclado e digitação |
| `Checkbox`, `Switch` | `Checkbox`, `Switch` | `<button role="checkbox|switch" aria-checked>` — rotule com `<Label htmlFor={id}>` |
| `Tabs` | `Tabs` | `tablist`/`tab`/`tabpanel`, setas entre abas |
| `NativeSelect`, `Input`, `Textarea`, `Label` | nativos | semântica do HTML; `Input` é o `Input` do base-ui (sem ARIA extra) |
| `Table*` | nativos | `<table>`/`<th>`; `aria-sort` é responsabilidade da página |
| `Sidebar` | `Sheet` no mobile / `div` no desktop | mobile: dialog com título `sr-only`; `SidebarTrigger` com `sr-only`; menu em `<ul>/<li>` |
| `DataPagination` | nativo | `<nav aria-label="Paginação">`, `aria-current="page"`, botões desabilitados nas pontas |
| `Tooltip` | `Tooltip` | abre por hover **e** foco; não use como único nome de botão |

## Correções típicas

| Sintoma | Correção |
|---|---|
| Leitor de tela lê "botão" sem nome na coluna Ações | `aria-label={`Editar ${row.original.nome}`}` no `Button size="icon-sm"` |
| Linha clicável (`onClick` no `TableRow`) não abre pelo teclado | Ponha um `Button` na linha (coluna Ações, "Ver detalhe") ou `tabIndex={0}` + `onKeyDown` para Enter/Space + `role="button"` — como em `historico/page.tsx` |
| Erro aparece mas o leitor não o associa ao campo | `aria-invalid` + `<p id="campo-erro">` + `aria-describedby="campo-erro"` no controle |
| Ao fechar o Sheet o foco some (vai para o `body`) | Abra pelo botão (o base-ui devolve ao trigger); se abriu por código, passe `finalFocus` ou foque o botão em `onOpenChange(false)` |
| Anel de foco invisível em fundo escuro (`bg-zinc-800`) | Troque `<button>` cru por `Button variant="ghost"` (anel `ring-ring`) ou adicione `focus-visible:ring-1 focus-visible:ring-ring` |
| Campo de filtro sem label visível | `aria-label="Filtrar por estado"` no `Input`/`Seletor`/`NativeSelect` |
| Tabela carrega em silêncio | `aria-busy={consulta.isPending}` no wrapper e `<span role="status" className="sr-only">Carregando…</span>` durante o skeleton |
| Cabeçalho ordenável sem `aria-sort` | `aria-sort={getCanSort() ? (asc ? "ascending" : desc ? "descending" : "none") : undefined}` no `TableHead` |
| Ícone informativo sem texto (ex.: badge só com ícone) | Texto `sr-only` ao lado ou `aria-label` no wrapper; ícone com `aria-hidden` |
| Texto em inglês no `sr-only` do shadcn ("Close", "Toggle Sidebar") | Traduza no componente em `components/ui` — o leitor de tela pronuncia em pt-BR |
| Animação roda com "reduzir movimento" ligado | `motion-reduce:animate-none` / `motion-reduce:transition-none` na classe, ou regra global em `globals.css` |
| Contraste reprovado só no tema claro | Ajuste o token em `:root` de `app/globals.css` (não a classe da tela) e rode `TEMA=light` de novo |

## Estado do template (revisado em 2026-09 no código)

As lacunas do primeiro relatório foram fechadas — confira antes de reabrir uma:

| Lacuna original | Onde foi resolvido |
|---|---|
| Sem skip link | `app/(auth)/layout.tsx` ("Pular para o conteúdo" → `#conteudo` no `<main>`) |
| Sidebar sem landmark `nav` | `components/app-sidebar.tsx`: `<nav aria-label="Menu principal">` |
| `TrocarSenhaDialog` como portal à mão | reescrito sobre `Dialog` (`components/ui/dialog.tsx`) — foco preso/devolvido, Esc, `aria-labelledby` |
| Linha clicável sem teclado (`historico`) | `TableRow` com `tabIndex={0}` + `onKeyDown` (Enter/Space) |
| Erros de senha não ligados ao campo | `usuarios`, `definir-senha`, `trocar-senha-dialog`: `<p id="…-erro" role="alert">` + `aria-describedby` |
| `sr-only` em inglês | `ui/sheet.tsx`/`ui/dialog.tsx` "Fechar"; `ui/sidebar.tsx` "Abrir ou fechar o menu", título "Menu" |
| Movimento reduzido só em dois pontos | regra global `@media (prefers-reduced-motion: reduce)` em `globals.css` |
| Botões crus do rodapé do sidebar sem anel | `BOTAO_RODAPE` com `focus-visible:ring-1 focus-visible:ring-sidebar-ring` |
| Editor de permissões sem nomes por linha | `aria-label="Ação/Subject/Remover permissão N"` em `papeis/page.tsx` |
| Tabela carregando em silêncio | `aria-busy={consulta.isPending}` no wrapper de todas as listagens |
| `lang="pt-br"` | `app/layout.tsx`: `lang="pt-BR"` |

Ainda em aberto (pequeno, corrija quando passar por ali):

1. `SidebarRail` (`components/ui/sidebar.tsx`) mantém `aria-label`/`title` "Toggle Sidebar" em inglês — traduza para "Abrir ou fechar o menu".
2. Skeleton das listagens conta só com `aria-busy`; tela que demora a carregar ganha um `<span role="status" className="sr-only">Carregando…</span>` no estado pendente.

Revisão nova: liste aqui o que encontrou e **onde**, e apague a linha quando corrigir — a tabela acima é o histórico do que já foi verificado, não uma lista de desejos.
