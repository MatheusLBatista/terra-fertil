# Template IA — Frontend

Painel administrativo do template, em Next.js (App Router) sobre a API em
[`../backend`](../backend). As convenções de código estão em [`CLAUDE.md`](./CLAUDE.md);
as do backend, em [`../CLAUDE.md`](../CLAUDE.md).

## Como rodar

```bash
cp .env.example .env.local   # ajuste as URLs se necessário
npm install
npm run dev                  # http://localhost:3000
```

Precisa da API no ar (`cd ../backend && npm run dev`, porta 3080) com o banco
já semeado (`npm run db:reset`). Login demo: `admin@example.com` / `102030fs`
(também `gestor@` e `usuario@`, para ver o menu mudar por papel).

O backend precisa listar `http://localhost:3000` em `API_CORS` e
`TRUSTED_ORIGINS` — sem isso o cookie de sessão não é aceito. Em outro domínio,
veja "Cookie de sessão e o proxy" no `CLAUDE.md`.

Requer Node 24+ (`engines` no `package.json`).

## Variáveis de ambiente

Validadas no boot/build por `lib/env.ts` (variável obrigatória em branco derruba
o `next dev`/`next build` com a mensagem do que falta).

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL base da API (obrigatória) |
| `NEXT_PUBLIC_APP_URL` | URL pública deste app — callbacks OAuth e links de e-mail (obrigatória) |
| `NEXT_PUBLIC_GOOGLE_LOGIN` | `true` mostra "Continuar com o Google" no login |
| `NEXT_PUBLIC_SIGNUP_ENABLED` | `true` libera o cadastro público em `/registrar` |
| `NEXT_PUBLIC_APP_NOME` | nome da aplicação (aba, menu, login); em branco "Template IA" |
| `NEXT_PUBLIC_AMBIENTE` | `development` / `staging` / `preview` mostra a pílula de ambiente |
| `NEXT_PUBLIC_PAGE_SIZES` | tamanhos de "Itens por página" (`10,25,50,100`) |
| `NEXT_PUBLIC_TIMEZONE` | fuso das datas exibidas (IANA); em branco, o do navegador |
| `NEXT_PUBLIC_TEMA_PADRAO` | `dark` (padrão) / `light` / `system` |
| `NEXT_PUBLIC_API_URL_CLIENT` | **depreciada** — fallback de `NEXT_PUBLIC_API_URL` |

## Scripts

```bash
npm run dev            # servidor de desenvolvimento
npm run build          # build de produção (standalone)
npm run start          # serve o build
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
npm run format         # Prettier (escreve)
npm run format:check   # Prettier (só confere)
npm run check          # typecheck + lint + format:check
npm run types          # exporta o OpenAPI do backend e regenera types/api.d.ts
npm run types:file     # regenera só a partir de ../backend/openapi.json
npm run e2e            # testes ponta a ponta (Playwright) — API e front no ar
npm run ui:verify      # prints por breakpoint + overflow + axe (Playwright)
```

`e2e` e `ui:verify` usam o Google Chrome instalado (`channel: "chrome"`) e as
URLs do `.env.local`. Prints em `e2e/prints`; `ROTAS=/municipios` limita as
telas, `CHECAR=axe` roda só a acessibilidade, `TEMA=light` troca o tema.

## Estrutura

```
app/
  (no-auth)/        login, registrar, recuperação e definição de senha, logout
  (auth)/           shell com sidebar; exige sessão (error.tsx próprio)
    dashboard/      em branco — ponto de partida do projeto
    municipios/     listagem de referência: busca, filtro, paginação
    estados/        listagem simples das 27 UFs
    historico/      auditoria (trigger do banco), com o antes/depois
    usuarios/       contas e papéis (plugin admin do better-auth)
    papeis/         CRUD de papéis e permissões
components/
  ui/               shadcn (base-ui)
  app-sidebar.tsx   navegação (estrutura do menu em lib/navegacao.ts)
lib/
  env.ts            NEXT_PUBLIC_* validadas (zod)
  fetchData.ts      envelope { data, meta, erros } + sessão por cookie
  erros-auth.ts     mensagens pt-BR para erros do better-auth
  senha.ts          regra de senha (SENHA_MIN + schema zod)
  formato.ts        dataHora, data, numero, moeda
  marca.ts          desenho da logo (Logo, apple-icon; icon.svg é estático)
  papeis.ts         papel do usuário e comparação por nível
```

Produção: `Dockerfile` (Next standalone) orquestrado pelo `docker-compose.prod.yml`
da raiz — as `NEXT_PUBLIC_*` entram como build args.
