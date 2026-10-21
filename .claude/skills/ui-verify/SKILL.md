---
name: ui-verify
description: Verificação visual do painel — roda Playwright nos breakpoints do Tailwind (375, 768, 1024, 1440), salva prints em frontend/e2e/prints, checa overflow horizontal e roda @axe-core/playwright (WCAG 2 A/AA). Use depois de mexer em qualquer tela do frontend, quando o usuário reportar "desalinhado", "quebrou no celular", "está feio", ou pedir para "conferir a tela".
---

# ui-verify — validação visual do frontend

Não confie em `tsc`/`lint` para layout: **olhe a tela**. Esta skill gera os prints
e aponta problemas objetivos (overflow, acessibilidade); o julgamento estético é
seu, lendo as imagens.

## Pré-requisitos

- API no ar em `localhost:3080` (`cd backend && bun run dev`) com o banco semeado
  (login `fslab.vilhena@ifro.edu.br` / `102030fs`).
- Front no ar em `localhost:3000` (`cd frontend && bun run dev`).
- Usa o Google Chrome instalado (`channel: "chrome"` em `frontend/playwright.config.ts`,
  projeto `ui-verify`); não baixa browser. Dependências no `package.json` do front.

## Como rodar

```bash
cd frontend
bun run ui:verify                                  # ROTAS_PADRAO (menu + telas públicas), 4 larguras, tema dark
ROTAS=/municipios,/usuarios bun run ui:verify      # só as telas que você mexeu
ROTAS=/nao-existe bun run ui:verify                # a página 404 (logado: o proxy deixa passar)
TEMA=light bun run ui:verify                       # tema claro
LARGURAS=375,1440 bun run ui:verify                # menos larguras (mais rápido)
CHECAR=prints bun run ui:verify                    # só prints + overflow (pula o axe — mais rápido)
CHECAR=axe bun run ui:verify                       # overflow + axe, sem tirar prints (skill acessibility)
```

Da **raiz** do repositório, `bun run ui:verify` é o mesmo que `cd frontend && bun run ui:verify`
(o script da raiz faz `bun run --cwd frontend ui:verify`; as variáveis acima valem igual).
`bunx playwright …` direto só funciona dentro de `frontend/` — a raiz não tem `node_modules`.

`CHECAR=tudo` (padrão) = prints + overflow + axe; valor inválido derruba a execução.

Saída: `frontend/e2e/prints/<rota>-<largura>.png` (ex.: `municipios-375.png`) e,
no terminal, um bloco por rota × largura com `overflow: ok` ou a lista de
elementos vazando, e as violações do axe (graves = serious/critical fazem o
teste falhar; as demais saem como aviso).

## Fluxo

1. Rode com `ROTAS=` apontando para as telas alteradas (todas, se mexeu em
   componente compartilhado: `PageLayout`, `components/ui/table.tsx`, `DataPagination`,
   `app-sidebar`, `globals.css`).
2. **Leia os prints** com a ferramenta Read (são PNG). Confira, em cada largura:
   filtros na mesma altura/largura, coluna Ações à direita, nada cortado, tabela
   com scroll próprio em vez de empurrar a página, textos sem quebra estranha.
3. Overflow reportado → o culpado costuma ser `min-w`, largura fixa (`w-96`) ou
   tabela sem `overflow-x-auto` no wrapper. Corrija e rode de novo só aquela rota.
4. Violação do axe → corrija na origem (label ausente, contraste, `aria-*`), não
   suprima a regra.
5. Ao terminar, mencione no resumo quais prints validaram a mudança. Os prints
   ficam fora do git (`.gitignore`).

## Onde está o código

- `frontend/e2e/ui-verify.spec.ts` — login por cookie na API, loop rotas ×
  larguras, print, `elementosComOverflow`, `AxeBuilder`, flag `CHECAR`.
- `frontend/playwright.config.ts` — projeto `ui-verify` (este) e projeto `e2e`
  (skill `teste-e2e`), Chrome local, URLs de `frontend/.env.local`, `outputDir`
  em `e2e/.resultados` (não rode os dois projetos ao mesmo tempo).
- Tela nova no painel: acrescente a rota em `ROTAS_PADRAO` no spec (ou passe em `ROTAS=`).
  Tela pública nova (abre sem sessão) entra também em `ROTAS_PUBLICAS` — essas vão sem cookie.

## Limites

- Telas que dependem de dados (ex.: histórico vazio) são verificadas no estado
  em que o banco está. Para ver o estado "com dados", crie registros antes.
- **Credenciais**: o default é o admin do seed (`fslab.vilhena@ifro.edu.br` / `102030fs`). O spec
  **não** lê o `backend/.env`: se lá estiverem `ADMIN_EMAIL`/`ADMIN_PASSWORD` (o seed usa esses),
  passe os mesmos em `UI_VERIFY_EMAIL`/`UI_VERIFY_SENHA`. Para ver a tela como outro papel, as
  mesmas variáveis com a conta dele (`gestor@example.com`, `usuario@example.com`).
- **Cookie de sessão**: o spec faz login na API (`NEXT_PUBLIC_API_URL`) e injeta o cookie
  `better-auth.session_token` no host de `NEXT_PUBLIC_APP_URL` (lidos do `frontend/.env.local`).
  Funciona quando painel e API dividem o domínio do cookie (ver "Cookie de sessão e o proxy" em
  `frontend/CLAUDE.md`). Em HTTPS o better-auth troca o nome para `__Secure-better-auth.session_token`
  — o spec não cobre esse caso; rode contra o ambiente local.
- **Telas públicas** (`/login`, `/recuperar-senha`, `/definir-senha` e, com
  `NEXT_PUBLIC_SIGNUP_ENABLED=true`, `/registrar`) são verificadas sem sessão e só no estado
  inicial: `/definir-senha` sem `?token=` mostra "Link inválido"; a confirmação "Verifique seu
  e-mail" e os erros de envio não aparecem nos prints (cubra-os no e2e).
