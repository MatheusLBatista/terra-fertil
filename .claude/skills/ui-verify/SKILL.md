---
name: ui-verify
description: Verificação visual do painel — roda Playwright nos breakpoints do Tailwind (375, 768, 1024, 1440), salva prints em frontend/e2e/prints, checa overflow horizontal e roda @axe-core/playwright (WCAG 2 A/AA). Use depois de mexer em qualquer tela do frontend, quando o usuário reportar "desalinhado", "quebrou no celular", "está feio", ou pedir para "conferir a tela".
---

# ui-verify — validação visual do frontend

Não confie em `tsc`/`lint` para layout: **olhe a tela**. Esta skill gera os prints
e aponta problemas objetivos (overflow, acessibilidade); o julgamento estético é
seu, lendo as imagens.

## Pré-requisitos

- API no ar em `localhost:3080` (`cd backend && npm run dev`) com o banco semeado
  (login `admin@example.com` / `102030fs`).
- Front no ar em `localhost:3000` (`cd frontend && npm run dev`).
- Usa o Google Chrome instalado (`channel: "chrome"` em `frontend/playwright.config.ts`,
  projeto `ui-verify`); não baixa browser. Dependências no `package.json` do front.

## Como rodar

```bash
cd frontend
npm run ui:verify                                  # todas as telas do menu, 4 larguras, tema dark
ROTAS=/municipios,/usuarios npm run ui:verify      # só as telas que você mexeu
TEMA=light npm run ui:verify                       # tema claro
LARGURAS=375,1440 npm run ui:verify                # menos larguras (mais rápido)
CHECAR=prints npm run ui:verify                    # só prints + overflow (pula o axe — mais rápido)
CHECAR=axe npm run ui:verify                       # overflow + axe, sem tirar prints (skill acessibility)
make ui-verify                                     # da raiz: o mesmo que o primeiro
```

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

## Limites

- Telas que dependem de dados (ex.: histórico vazio) são verificadas no estado
  em que o banco está. Para ver o estado "com dados", crie registros antes.
- A verificação faz login como admin; para ver a tela como outro papel, use
  `UI_VERIFY_EMAIL`/`UI_VERIFY_SENHA` (`gestor@example.com`, `usuario@example.com`).
