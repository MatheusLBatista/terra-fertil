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
   cd frontend && CHECAR=axe ROTAS=/rota bun run ui:verify     # só acessibilidade
   cd frontend && CHECAR=axe TEMA=light ROTAS=/rota bun run ui:verify
   ```
   `CHECAR=axe` não tira prints (só overflow + axe); para ver a tela, rode sem `CHECAR` (prints em
   `frontend/e2e/prints`, skill `ui-verify`). Corrija cada violação na origem (regra nunca é suprimida);
   itens *incomplete* (fundo semitransparente como `bg-destructive/10`, `bg-input/30`) entram na
   conferência de contraste do passo 4.
2. **Teclado, sem mouse**, na rota inteira:
   - `Tab`/`Shift+Tab`: a ordem segue a leitura (sidebar → cabeçalho → filtros → tabela → rodapé);
     todo controle focado mostra anel (`focus-visible:ring`); nada focável está escondido.
   - `Enter`/`Space` acionam botões; `Esc` fecha Sheet/AlertDialog/Dialog/combobox. Só nas telas do
     layout `(auth)` (é lá que o `EnterFieldNavigation` é montado), `Enter` num `<input>` de formulário
     pula ao próximo campo e só no último submete; nas telas públicas (login, recuperar/definir senha,
     registrar) o `Enter` submete direto, como no HTML.
   - Sheet e AlertDialog: ao abrir, o foco entra no painel (primeiro campo ou botão); `Tab` circula
     só dentro dele; ao fechar, o foco **volta ao botão que abriu**. Se a ação some com esse botão
     (excluir/remover a linha, banir troca "Banir" por "Desbanir"), o foco precisa de um destino
     estável — ver "Foco depois que o gatilho some" abaixo.
   - Troca de conteúdo sem navegação (formulário → confirmação, ex.: `/recuperar-senha` após enviar):
     o foco vai para o título novo (`tabIndex={-1}`) e uma região `role="status"` que já estava na
     página anuncia o resultado.
   - Combobox (`Seletor`): setas ↑/↓ percorrem a lista, `Enter` seleciona, `Esc` fecha sem escolher;
     o botão "Limpar seleção" é alcançável por `Tab`.
   - Tabela: cabeçalho ordenável é um botão (`Enter` alterna); container rola com ←/→ quando focado.
   - Linha clicável: o teclado chega pelo botão da coluna Ações ("Ver detalhes"), não pela linha.
3. **Nomes e anúncios** (árvore de acessibilidade do DevTools, ou `getByRole` no Playwright):
   - Botão só com ícone tem nome (`aria-label`) que inclui o registro: "Editar ana@…", não "Editar".
   - Cabeçalho ordenado expõe `aria-sort`; a página tem um `h1`; toasts e loading são anunciados.
   - Erro devolvido pelo servidor (senha errada, 400 da API) aparece **no formulário**, ligado ao
     campo — toast sozinho some e não diz qual campo corrigir.
4. **Contraste nos dois temas** (`TEMA=light` e dark): texto `text-muted-foreground` sobre
   `bg-muted`, badges `variant="destructive"`/`outline`, botões `variant="link"` e `ghost` em hover.
5. **Movimento**: com "reduzir movimento" ligado no SO, animações de entrada de Sheet/AlertDialog, o
   `animate-ping` da `AmbientePill` e o Comet do `Spinner`/`Loading` (`loading-dev`, animação CSS)
   não devem rodar (ou ficam instantâneas).
6. Relate o que passou e o que ficou pendente; corrija na tela, nunca com `aria-hidden` para
   "silenciar" um problema.

## O que o axe não cobre — e onde está neste código

| Item | Como está no template | O que verificar na tela nova |
|---|---|---|
| Foco visível | `Button`, `Input`, `NativeSelect`, `Textarea`, `Checkbox` trazem `focus-visible:ring-1 ring-ring/50` (`components/ui/*`); anel azul `--ring` nos dois temas; os botões crus do rodapé do sidebar (`BOTAO_RODAPE` em `app-sidebar.tsx`) levam `focus-visible:ring-1 ring-sidebar-ring` | `<button>`/`<a>` crus precisam de `focus-visible:ring-*` ou virar `Button variant="ghost"` |
| Foco preso e devolvido | base-ui `Dialog`/`AlertDialog` (Sheet, `Dialog` do `TrocarSenhaDialog`, ConfirmacaoDialog): `modal`, foco inicial no primeiro tabbable (`initialFocus`), `finalFocus` de volta ao trigger, Esc fecha | Confirmar que o botão de origem recebe o foco ao fechar; sem `autoFocus` manual; nunca um portal à mão |
| Foco depois que o gatilho some | `ConfirmacaoDialog` aceita `focoAposConfirmar` (ref): quando a ação conclui e o botão de origem saiu do DOM (linha excluída, "Banir" virou "Desbanir"), o foco vai para esse alvo estável em vez do `<body>` — em `/usuarios` e `/papeis`, a própria `<Table ref tabIndex={-1}>`. Cancelar/Esc continua devolvendo ao botão de origem | Toda ação que remove ou troca o próprio gatilho define um alvo estável (a tabela, o título da página, o botão "Novo X"); alvo não interativo leva `tabIndex={-1}` |
| Nome de botão só com ícone | Coluna Ações: `aria-label={`Editar ${nome}`}` (`usuarios`, `papeis`); editor de permissões: "Ação da permissão N" / "Recurso da permissão N" / "Remover permissão N" (`papeis`); combobox: "Abrir opções"/"Limpar seleção" (`ui/combobox.tsx`); `ScrollToTop`: "Voltar ao topo"; sidebar: "Trocar senha", "Sair", "Alternar tema", "Abrir ou fechar o menu" | Todo `size="icon*"` com `aria-label` em pt-BR e específico ao registro (linhas repetidas levam o índice); `title` sozinho é fallback fraco |
| `aria-sort` | `<TableHead aria-sort={…}>` só em coluna com `getCanSort()` (`data-table-pattern`) | Coluna não ordenável fica `undefined`, nunca `"none"` |
| Loading e toasts | `Loading.tsx` e `Spinner` = `role="status" aria-label="Carregando"`; react-toastify põe `role="alert"` em cada toast (pausa no hover/foco por padrão); `AmbientePill` = `role="status"`; toda listagem tem `aria-busy={consulta.isPending}` no wrapper `div.border` da tabela | Linhas de `Skeleton` não anunciam nada sozinhas: mantenha o `aria-busy` no wrapper (e, se a tela demora, um `sr-only` em `role="status"`) |
| Erros de formulário | `Input`/`Textarea`/`NativeSelect` pintam por `aria-invalid`; `usuarios`, `papeis`, `registrar`, `definir-senha` e `trocar-senha-dialog` ligam o `<p id="…-erro" role="alert">` por `aria-describedby`. Erro do **servidor** também vai ao campo: `login` (credenciais recusadas → `#login-erro` + `aria-invalid` nos dois campos; some ao editar) e `trocar-senha-dialog` (senha atual incorreta → `#senha-atual-erro` + foco no campo). `login` usa `<p role="alert">` também para OAuth e sessão expirada | `aria-invalid` **e** `<p id="x-erro">` referenciado por `aria-describedby` (skill `form-pattern`); lista de `erros[]` da API em `role="alert"` |
| `<label htmlFor>` | Todos os formulários (`usuarios`, `papeis`, `login`, `definir-senha`) usam `Label htmlFor` + `id`; filtros sem label visível usam `aria-label` | Campo sem `<Label>` visível leva `aria-label`; nunca só `placeholder` |
| Landmarks e `h1` | `SidebarInset` = `<main>`; menu do sidebar em `<nav aria-label="Menu principal">` (`app-sidebar.tsx`); `PageLayout` = `<header>` + um `h1` por tela; `DataPagination` = `<nav aria-label="Paginação">`; breadcrumb = `<nav aria-label="Trilha de navegação">`; `not-found` e `app/error.tsx` (sem `PageLayout`) dão o `h1` pelo `EmptyState titleAs="h1"` | Título via `PageLayout title` (não crie outro `h1`); tela fora do shell sem `PageLayout` usa `titleAs="h1"`; seções grandes com `aria-labelledby` |
| Região rolável focável | `ui/table.tsx`: wrapper com `tabIndex={0}` + `focus-visible:ring` (regra `scrollable-region-focusable`); JSON do detalhe em `/historico`: `<pre role="region" tabIndex={0} aria-label="Dados … da alteração">` com `max-h-72 overflow-auto` e anel de foco | Outro container `overflow-auto` (inclusive `<pre>`/código) com conteúdo maior que a área precisa de `tabIndex={0}`, `role="region"` + `aria-label` e `focus-visible:ring` — sem isso o teclado não rola |
| Texto alternativo da marca | `Logo` = `<svg aria-hidden="true">` com texto "Template IA" ao lado (`AuthShell`, sidebar); sidebar recolhido: `Link aria-label="Ir para o dashboard"`; ícones lucide (em tudo, sidebar inclusive) são `aria-hidden` por padrão | Ícone que carrega informação sozinho (badge só com ícone) precisa de texto `sr-only` ou `aria-label` no wrapper; SVG de outra origem (marca, ilustração) leva `aria-hidden` ou `role="img"` + `aria-label` |
| Idioma | `app/layout.tsx`: `<html lang="pt-BR">`; textos `sr-only` dos componentes shadcn traduzidos ("Fechar", "Abrir ou fechar o menu", "Menu") | Trechos em outro idioma levam `lang` próprio; componente novo do shadcn chega com `sr-only` em inglês — traduza |
| Movimento reduzido | Regra global em `globals.css` (`@media (prefers-reduced-motion: reduce)` zera animação e transição de tudo — cobre Sheet/AlertDialog/Dialog/Tooltip e o Comet do `loading-dev`); `ScrollToTop` lê a media query (`scrollTo` sem `smooth`); `AmbientePill` usa `motion-reduce:animate-none` | Animação por JS (`scrollTo`, `requestAnimationFrame`) não é coberta pelo CSS: leia a media query como o `ScrollToTop` |
| Skip link | `app/(auth)/layout.tsx`: "Pular para o conteúdo" (`sr-only focus:not-sr-only`) antes do sidebar, alvo `id="conteudo"` no `<main>` | Layout novo fora de `(auth)` (ex.: área pública com menu) repete o padrão |

## Componentes base-ui/shadcn usados aqui e o ARIA que já entregam

Verificado em `node_modules/@base-ui/react@1.8.0`:

| Componente (`components/ui`) | Primitivo | ARIA/comportamento incluído |
|---|---|---|
| `Sheet` | `Dialog` | `role="dialog"`, `aria-labelledby`→`SheetTitle`, `aria-describedby`→`SheetDescription`, modal (foco preso, fora inerte), Esc, foco devolvido ao trigger; botão fechar com `sr-only` |
| `AlertDialog` / `ConfirmacaoDialog` | `AlertDialog` | `role="alertdialog"`, título/descrição ligados, modal, Esc; `AlertDialogCancel` é `Close` |
| `Combobox` / `Seletor` | `Combobox` | `role="combobox"` no input com `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete`; lista `role="listbox"`, itens `role="option"` + `aria-selected`; setas/Enter/Esc |
| `Dialog` (`TrocarSenhaDialog`) | `Dialog` | `role="dialog"`, título/descrição ligados, modal, Esc; fechar com `sr-only` "Fechar" (e `DialogFooter showCloseButton` = "Fechar") |
| `Checkbox` | `Checkbox` | `<button role="checkbox" aria-checked>` — rotule com `<Label htmlFor={id}>` |
| `Select`, `Switch`, `Tabs` (se adicionar — não estão em `components/ui`) | `Select`, `Switch`, `Tabs` | `Select`: trigger `role="combobox"` + `listbox`/`option`; `Switch`: `role="switch" aria-checked`; `Tabs`: `tablist`/`tab`/`tabpanel` com setas. Ao adicionar, traduza os `sr-only` e confira o anel de foco |
| `NativeSelect`, `Input`, `Textarea`, `Label` | nativos | semântica do HTML; `Input` é o `Input` do base-ui (sem ARIA extra) |
| `Table*` | nativos | `<table>`/`<th>`; `aria-sort` é responsabilidade da página |
| `Sidebar` | `Sheet` no mobile / `div` no desktop | mobile: dialog com título `sr-only`; `SidebarTrigger` com `sr-only`; menu em `<ul>/<li>` |
| `DataPagination` | nativo | `<nav aria-label="Paginação">`, `aria-current="page"`, botões desabilitados nas pontas |
| `Tooltip` | `Tooltip` | abre por hover **e** foco; não use como único nome de botão |

## Correções típicas

| Sintoma | Correção |
|---|---|
| Leitor de tela lê "botão" sem nome na coluna Ações | `aria-label={`Editar ${row.original.nome}`}` no `Button size="icon-sm"` |
| Linha clicável (`onClick` no `TableRow`) não abre pelo teclado | Ponha um `Button` com nome do registro na coluna Ações ("Ver detalhes da alteração X") — como em `historico/page.tsx`; o `onClick` da linha fica só como atalho de mouse. **Sem** `tabIndex`/`role="button"` na linha (`<tr>` com role de botão quebra a semântica da tabela) |
| Depois de excluir/banir pela confirmação o foco cai no `<body>` | `focoAposConfirmar: ref` no objeto `Confirmacao` apontando para um alvo estável (tabela com `tabIndex={-1}`, título, botão "Novo X") |
| Formulário troca por mensagem de sucesso e o leitor não percebe | Região `role="status"` já montada antes da troca (texto entra depois) + foco no título novo com `tabIndex={-1}` (ref de callback estável, fora do componente) |
| Erro do servidor só em toast (login/senha recusados) | Guarde o erro em estado: `<p id="x-erro" role="alert">` + `aria-invalid` + `aria-describedby` no campo; limpe ao editar |
| `<pre>`/bloco de código com scroll não rola pelo teclado | `tabIndex={0}` + `role="region"` + `aria-label` + `focus-visible:ring-1 focus-visible:ring-ring` |
| Erro aparece mas o leitor não o associa ao campo | `aria-invalid` + `<p id="campo-erro">` + `aria-describedby="campo-erro"` no controle |
| Ao fechar o Sheet o foco some (vai para o `body`) | Abra pelo botão (o base-ui devolve ao trigger); se abriu por código, passe `finalFocus` ou foque o botão em `onOpenChange(false)` |
| Anel de foco invisível em fundo escuro (`bg-zinc-800`) | Troque `<button>` cru por `Button variant="ghost"` (anel `ring-ring`) ou adicione `focus-visible:ring-1 focus-visible:ring-ring` |
| Campo de filtro sem label visível | `aria-label="Filtrar por estado"` no `Input`/`Seletor`/`NativeSelect` |
| Tabela carrega em silêncio | `aria-busy={consulta.isPending}` no wrapper e `<span role="status" className="sr-only">Carregando…</span>` durante o skeleton |
| Cabeçalho ordenável sem `aria-sort` | `aria-sort={getCanSort() ? (asc ? "ascending" : desc ? "descending" : "none") : undefined}` no `TableHead` |
| Ícone informativo sem texto (ex.: badge só com ícone) | Texto `sr-only` ao lado ou `aria-label` no wrapper; ícone com `aria-hidden` |
| Texto em inglês no `sr-only`/`aria-label` do shadcn ("Close", "Toggle Sidebar", `aria-label="breadcrumb"`) | Traduza no componente em `components/ui` — o leitor de tela pronuncia em pt-BR |
| Animação roda com "reduzir movimento" ligado | `motion-reduce:animate-none` / `motion-reduce:transition-none` na classe, ou regra global em `globals.css` |
| Contraste reprovado só no tema claro | Ajuste o token em `:root` de `app/globals.css` (não a classe da tela) e rode `TEMA=light` de novo |

## Estado do template (revisado em 2026-10 no código)

As lacunas do primeiro relatório foram fechadas — confira antes de reabrir uma:

| Lacuna original | Onde foi resolvido |
|---|---|
| Sem skip link | `app/(auth)/layout.tsx` ("Pular para o conteúdo" → `#conteudo` no `<main>`) |
| Sidebar sem landmark `nav` | `components/app-sidebar.tsx`: `<nav aria-label="Menu principal">` |
| `TrocarSenhaDialog` como portal à mão | reescrito sobre `Dialog` (`components/ui/dialog.tsx`) — foco preso/devolvido, Esc, `aria-labelledby` |
| Linha clicável sem teclado (`historico`) | botão "Ver detalhes" na coluna Ações; clique na linha é só atalho de mouse (sem `tabIndex` na linha) |
| Erros de senha não ligados ao campo | `usuarios`, `definir-senha`, `trocar-senha-dialog`: `<p id="…-erro" role="alert">` + `aria-describedby` |
| `sr-only` em inglês | `ui/sheet.tsx`/`ui/dialog.tsx` "Fechar"; `ui/sidebar.tsx` "Abrir ou fechar o menu", título "Menu" |
| Movimento reduzido só em dois pontos | regra global `@media (prefers-reduced-motion: reduce)` em `globals.css` |
| Botões crus do rodapé do sidebar sem anel | `BOTAO_RODAPE` com `focus-visible:ring-1 focus-visible:ring-sidebar-ring` |
| Editor de permissões sem nomes por linha | `aria-label` "Ação da permissão N" / "Recurso da permissão N" / "Remover permissão N" em `papeis/page.tsx` |
| Tabela carregando em silêncio | `aria-busy={consulta.isPending}` no wrapper de todas as listagens |
| `lang="pt-br"` | `app/layout.tsx`: `lang="pt-BR"` |
| `SidebarRail` "Toggle Sidebar" | `ui/sidebar.tsx`: "Abrir ou fechar o menu" |
| Skeleton das listagens só com `aria-busy` | `<span role="status" className="sr-only">Carregando…</span>` na primeira linha do skeleton em todas as listagens |
| `not-found`/`app/error.tsx` sem `h1` | `EmptyState titleAs="h1"` |
| Breadcrumb e `DialogFooter` em inglês | `aria-label="Trilha de navegação"`; botão "Fechar" |
| Confirmação de `/recuperar-senha` sem anúncio, foco perdido | `role="status"` persistente + foco no título "Verifique seu e-mail" |
| Erro do servidor só em toast (`login`, `trocar-senha-dialog`) | erro inline ligado ao campo (`aria-invalid` + `aria-describedby`) |
| Foco no `<body>` após remover/banir em `/usuarios`/`/papeis` | `ConfirmacaoDialog` `focoAposConfirmar` → tabela |

Ainda em aberto: nada registrado.

Revisão nova: liste aqui o que encontrou e **onde**, e apague a linha quando corrigir — a tabela acima é o histórico do que já foi verificado, não uma lista de desejos.
