# Frontend — guia para o agente

Painel administrativo do template, em Next.js App Router sobre a API em
`../backend` (porta 3080). Este arquivo cobre as convenções do frontend; as do
backend estão em `../CLAUDE.md`.

## Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript, Node 24+
- **Estilização**: Tailwind CSS v4, shadcn/ui (estilo `base-lyra`, sobre `@base-ui/react`)
- **Estado de servidor**: TanStack Query v5 (devtools em dev, canto inferior esquerdo)
- **Tabelas**: `@tanstack/react-table` v9 (`useTable` + `flexRender`; sem componente de tabela genérico)
- **Formulários**: `react-hook-form` + `zodResolver` (zod v4) nos cadastros do painel
- **Autenticação**: `better-auth` (client-side via `authClient.useSession()`)
- **Estado na URL**: `nuqs` (paginação, filtros)
- **Ícones**: `lucide-react` em tudo (menu lateral inclusive — `strokeWidth={1.75}` lá)
- **Notificações**: `react-toastify` (segue o tema)
- **Gráficos**: `recharts` via `components/ui/chart.tsx` (pronto para o dashboard; nenhuma tela usa ainda)
- **Tema**: `next-themes`, padrão `NEXT_PUBLIC_TEMA_PADRAO` (dark)
- **Loading**: `loading-dev` (spinner "Comet") em `components/Loading.tsx` (overlay de tela) e `components/ui/spinner.tsx` (inline, ex.: botão de submit)
- **Fontes**: `next/font` self-hosted em `app/layout.tsx` — Inter (`--font-sans`) e JetBrains Mono
  (`--font-mono`); `--font-heading` é um alias da sans em `globals.css`. Trocar de fonte = trocar
  ali e manter os nomes das variáveis.
- **Marca** (Projeto Terra Fértil, verde `#589E3A` = `--primary`): PNGs brancos recortados do
  `ID-Projeto-Terra-Fertil-Branco-952x1536.png` da raiz — `public/marca-terra-fertil.png` (símbolo)
  e `public/logo-terra-fertil.png` (assinatura completa) entram como `mask-image` em
  `components/logo.tsx` (`Logo` = ladrilho do menu; `LogoCompleto` = telas de login), então a cor
  vem do tema. `app/icon.png` e `app/apple-icon.png` são estáticos (símbolo sobre o verde).

## Comandos

```bash
bun run dev            # servidor de desenvolvimento (porta 3000)
bun run build          # build de produção (output standalone)
bun run typecheck      # tsc --noEmit
bun run lint           # ESLint
bun run format         # Prettier (printWidth 110, aspas duplas, plugin tailwind)
bun run format:check   # só confere
bun run check          # typecheck + lint + format:check — rode antes de entregar
bun run types          # exporta o OpenAPI do backend (bun run openapi:export lá) e regenera types/api.d.ts
bun run types:file     # regenera só de ../backend/openapi.json (sem exportar)
```

Verificação visual (prints por breakpoint, overflow, axe): `bun run ui:verify` (skill
`ui-verify`, prints em `e2e/prints`; `CHECAR=axe` para só acessibilidade). Testes ponta
a ponta: `bun run e2e` (skill `teste-e2e`, `e2e/tests/*.e2e.ts`).
Revisão de acessibilidade além do axe (teclado, foco, nomes, ARIA): skill `acessibility`.

Deploy: imagem Docker própria (`Dockerfile`, Next standalone) orquestrada pelo
`docker-compose.qa.yml` da raiz (serviço `front`), construída pelo `.gitlab-ci.yml` — as
`NEXT_PUBLIC_*` entram como build args a partir das variáveis `QA_*` do CI (não há `.env`
do front no deploy).

## Variáveis de ambiente

Todas passam por `lib/env.ts` (zod, no carregamento do módulo): variável obrigatória
em branco ou inválida derruba o `next dev`/`next build` com a lista do que falta.
**Código novo importa `env` de `@/lib/env`** — nunca leia `process.env.NEXT_PUBLIC_*` direto.

| Variável | `env.` | Para quê |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `API_URL` | URL base da API (obrigatória; `fetchData`, `authClient`, logger) |
| `NEXT_PUBLIC_APP_URL` | `APP_URL` | URL pública deste app — callbacks OAuth e links de e-mail (obrigatória) |
| `NEXT_PUBLIC_GOOGLE_LOGIN` | `GOOGLE_LOGIN` | `true` mostra "Continuar com o Google" no login |
| `NEXT_PUBLIC_SIGNUP_ENABLED` | `SIGNUP_ENABLED` | `true` mostra "Criar conta" no login e libera `/registrar`; senão `/registrar` vai para `/login` |
| `NEXT_PUBLIC_APP_NOME` | `APP_NOME` | nome da aplicação (aba, menu, login); em branco "Template IA" (`APP_NOME` em `lib/app.ts`) |
| `NEXT_PUBLIC_AMBIENTE` | `AMBIENTE` | `development` / `staging` / `preview` mostra a pílula (`components/ambiente-pill.tsx`) |
| `NEXT_PUBLIC_PAGE_SIZES` | `PAGE_SIZES` | tamanhos de "Itens por página" (`"10,25,50,100"`, o primeiro é o padrão; `lib/pageSizes.ts`) |
| `NEXT_PUBLIC_TIMEZONE` | `TIMEZONE` | fuso IANA das datas exibidas (`lib/formato.ts`); em branco, o do navegador |
| `NEXT_PUBLIC_TEMA_PADRAO` | `TEMA_PADRAO` | `dark` (padrão) / `light` / `system` |
| `NEXT_PUBLIC_API_URL_CLIENT` | — | **depreciada**: só fallback de `NEXT_PUBLIC_API_URL`; apague dos `.env` |

Variável `NEXT_PUBLIC_*` nova entra em `lib/env.ts` (schema + objeto `env`), no
`.env.example` e como `ARG`/`ENV` no `Dockerfile` (o compose de produção passa build args).

O backend precisa deste app em `API_CORS` e `TRUSTED_ORIGINS` — sem isso a
sessão não sobe (a API recusa o cookie).

### Cookie de sessão e o proxy

O `proxy.ts` decide no servidor se há sessão olhando o **cookie do better-auth na
requisição do front**. O cookie é emitido pela API, então ele só chega ao front quando
o domínio do cookie cobre o host do painel: mesmo host (ex.: `localhost:3000` e
`localhost:3080` — porta não entra no domínio do cookie) ou `COOKIE_DOMAIN` do backend
apontando para o domínio pai (`.exemplo.com` cobre `painel.exemplo.com` e
`api.exemplo.com`). Em hosts sem parentesco (`painel.a.com` × `api.b.com`) o proxy
nunca vê o cookie.

Sintoma: **loop de login** — a API autentica, o `authClient` até enxerga a sessão, mas
toda navegação para `/dashboard` volta a `/login?next=…` porque o proxy não recebeu o
cookie. Corrija o `COOKIE_DOMAIN`/hosts; não "relaxe" o proxy.

## Segurança HTTP

`next.config.ts` manda em toda resposta: CSP (`default-src 'self'`; `connect-src` com a
origem de `NEXT_PUBLIC_API_URL`; `img-src https:` para o avatar do Google; `script-src`
com `'unsafe-inline'` porque o App Router injeta scripts inline — sem nonce por request;
`'unsafe-eval'` só em dev), `frame-ancestors 'none'`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `X-Content-Type-Options:
nosniff`, e `poweredByHeader: false`. Recurso externo novo (CDN, iframe, API de
terceiros) precisa entrar na diretiva certa do CSP — o erro aparece no console do
navegador como "Refused to …".

## Autenticação e papéis

- Sessão do better-auth em **cookie httpOnly**; `fetchData` manda
  `credentials: "include"` em toda chamada. Não existe token no localStorage.
- `proxy.ts` (convenção do Next 16) redireciona para `/login` no servidor toda rota
  sem cookie de sessão, exceto as do `matcher` (`/login`, `/registrar`,
  `/recuperar-senha`, `/definir-senha`, `/logout`, `/_next/*`, ícones e arquivos de
  `public/`) — tela nova não mexe no proxy. Ele só vê a **presença** do cookie: a
  validade da sessão quem confirma é `app/(auth)/layout.tsx`, no cliente. A raiz `/`
  vai para `/dashboard` com cookie e para `/login` sem; `/login` nunca é
  redirecionado pelo cookie (evita loop com cookie vencido).
- **Volta à tela de origem (`next`)**: o proxy manda para
  `/login?next=<pathname+search>`; o layout `(auth)` sem sessão válida e o 401
  do `fetchData` mandam para `/logout?next=…` (o 401 acrescenta
  `motivo=expirada`), e `/logout` encerra a sessão e repassa os dois ao
  `/login`. O login lê `next` de `window.location` (sem `useSearchParams`),
  aceita só caminho interno (`destinoInterno` em `lib/app.ts`: começa com `/`
  e não com `//`) e navega para ele após entrar (fallback `/dashboard`); com
  `motivo=expirada` mostra "Sua sessão expirou" inline (`role="alert"`).
- **Erros do `authClient`** (login, cadastro, senha, admin): `mensagemErroAuth(error, padrao)`
  (`lib/erros-auth.ts`) traduz `error.code`/`error.status` — 429 vira "Muitas tentativas.
  Aguarde alguns minutos.", 403 "Sem permissão…", códigos do better-auth em pt-BR; mensagem
  em inglês nunca chega ao usuário. Use-o em todo `onError`/`if (error)` do `authClient`.
- **Senha**: a regra mora em `lib/senha.ts` (`SENHA_MIN = 8`, `senhaSchema`,
  `senhaOpcionalSchema`, `senhaValida()`, `SENHA_DICA` para placeholder). Não repita o `8`.
- O papel é `user.role`, com FK para `papeis.nome` no banco. Os papéis são
  **dinâmicos** (CRUD em `/papeis`): selects usam `usePapeisDinamicos()`
  (`hooks/use-papeis.ts`, `GET /papeis?incluir=permissoes` — a mesma consulta e
  `queryKey` da tela `/papeis`, um só registro no cache); os três do seed
  (admin/gestor/usuario) são fallback e régua de nível do menu.
- `lib/papeis.ts` expõe `usePapel()` com `papel` (string — pode ser um papel
  dinâmico), `ehAdmin` e `podeGerenciar(minimo)` (comparação por nível:
  usuario < gestor < admin — papel fora do seed conta como `usuario`, o nível
  mais baixo: vê Dashboard e os cadastros de leitura, não a administração).
  `papelParaApi()` é o único cast (o plugin admin tipa `role` como "user" | "admin").
- Esconder na UI o que o backend recusaria evita 403 em tela; **não** esconda o
  que o backend permite. A autorização de verdade é sempre a do servidor.
- Módulo novo: registre a permissão do Subject no seed `src/seeds/papeis.ts` do
  backend (ou pela tela `/papeis`) e acrescente o item em `NAV_GROUPS`
  (`lib/navegacao.ts` — o sidebar só renderiza; `grupoDaTela(pathname)` dá o
  grupo do menu para o breadcrumb do `PageLayout`). O proxy já protege a rota
  nova; nada a registrar lá.
- **Textos para o usuário final**: nada de jargão de implementação na tela (FK, cascade,
  CASL, soft delete, seed, `user.role`, cache de 30s). Explique o efeito ("renomear
  atualiza os usuários que têm este papel"); o detalhe técnico vai em comentário.

## Padrões de código

### Páginas

Tudo dentro de `(auth)/` é `"use client"` e usa `PageLayout`:

```tsx
"use client";

import { PageLayout } from "@/components/page-layout";
import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/fetchData";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Municipio = components["schemas"]["Municipio"];

export default function MinhaPage() {
  const municipios = useQuery({
    queryKey: ["municipios", { limit: 10 }],
    queryFn: ({ signal }) => fetchData<Envelope<Municipio[]>>("/municipios", { query: { limit: 10 }, signal }),
  });
  const linhas = municipios.data?.data ?? [];

  return <PageLayout title="Título">{/* … */}</PageLayout>;
}
```

**Não desestruture o resultado do `useQuery`**: guarde-o num objeto nomeado por
consulta (`const municipios = useQuery(...)`) e leia `municipios.data`,
`municipios.isPending`, `municipios.isError`, `municipios.refetch` — telas com
várias consultas ficam legíveis sem renomear cada campo.

### Query keys e cache

- **Formato**: `["recurso", { ...filtros }]` — o primeiro elemento é o nome do recurso
  (plural, como na rota), o segundo um objeto com **todos** os inputs da request
  (`termo`, filtros, `sort`, `page`, `limit`). Lista sem filtro: `["estados"]`. Detalhe:
  `["papeis", id]`. Sub-recurso fixo: `["historico", "tabelas"]`.
- Invalidação pelo **prefixo**: `invalidateQueries({ queryKey: ["produtos"] })` derruba a
  lista com qualquer filtro e os detalhes.
- Uma consulta, uma key: quem precisa da mesma lista em duas telas usa a mesma key e a
  mesma `queryFn` (ex.: `usePapeisDinamicos()` serve `/papeis` e os selects de papel).
- **`staleTime`/`gcTime` só no `queryProvider`** (`staleTime: 30_000` global). Nenhuma
  tela ou hook sobrescreve.
- Retry global: 4xx não repete; 5xx/rede tentam 2x. O `onError` global de mutations só
  registra o que o `fetchData` não registrou (exceção de código, 5xx do `authClient`).

### Tabelas

Tabelas usam TanStack Table **dentro da página** (veja `app/(auth)/estados/page.tsx`
e `usuarios/page.tsx`): `features = tableFeatures({...})` no topo do arquivo (com
`columnMeta: {} as { className?: string }` para largura/alinhamento das colunas),
`ColumnDef<typeof features, Registro>[]` inline (célula lê `row.original`),
`useTable({ features, columns, data })` e `flexRender` nos `TableHead`/`TableCell`
do shadcn (`row.getAllCells()`). Paginação é do servidor: `rowPaginationFeature` +
`manualPagination: true` (nunca o row model de paginação). Ordenação só onde a API
tem allowlist `sort=campo:asc|desc`: `rowSortingFeature` + `manualSorting: true`,
estado em `useQueryState("sort")` (nuqs) convertido em `sorting` (memoizado) e
`onSortingChange` grava a URL; colunas não ordenáveis levam `enableSorting: false`;
o `<th>` ordenável recebe `aria-sort` e um `Button` ghost com ícone Arrow*. Lista
pequena sem paginação (estados) ordena no cliente com `createSortedRowModel()`.

`<Table aria-label="Lista de municípios">` — toda tabela tem nome acessível.

Toda tabela cobre os estados, escritos na própria página, dentro do `<TableBody>`,
cada um numa `TableCell` com `colSpan={table.getAllColumns().length}`:

- `isPending`: linhas de `Skeleton`; a primeira leva `<span role="status" className="sr-only">Carregando…</span>`.
- `isError`: `ehSemPermissao(consulta.error)` (403) mostra "Você não tem permissão para
  ver isto." **sem** botão; qualquer outro erro mostra a mensagem + "Tentar novamente"
  chamando `refetch`.
- Vazia: uma linha discreta ("Nenhum município encontrado"). Se a lista veio vazia mas
  `meta.total > 0` e `page > 1` (URL antiga, registros removidos), a linha diz "Esta
  página não existe mais." com um `Button variant="link"` "Ir para a última página"
  (`setPage(totalPages)`). É um evento, não um efeito: nada de `setPage` em `useEffect`.
- Dados.

Rodapé (na página): fica renderizado **também durante o loading** (um `Skeleton` no
lugar da contagem, para a tela não pular) e some só quando não há registros. A
contagem é o intervalo com milhar: `1–10 de 5.570 municípios`
(`numero()` de `lib/formato.ts`; `offset + 1` a `offset + linhas.length`).
Não extraia nada disso para componente ou hook (`DataTable`, `useDataTable`,
`columns.tsx`): a tela inteira se lê num arquivo só.

Coluna de ações: sempre a última da tabela, alinhada à direita (`text-right`,
botões em `flex justify-end gap-1`). Linha clicável (`onClick` no `TableRow`) é só
atalho de mouse: o teclado chega pelo botão da coluna de ações (ex.: "Ver detalhes"
em `/historico`) — sem `tabIndex` na linha.

Busca com debounce: `const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage)`
(`hooks/use-busca-debounce.ts`) — `termo` é um `useQueryState` do nuqs (a busca
fica na URL) e `busca` é o valor do `<Input>`; 400ms sem digitar grava o termo
e volta para a página 1.

Seleção com busca (filtro por relacionamento): `<Seletor opcoes valor onValorChange>`
(`components/seletor.tsx`), por cima do `Combobox` do shadcn — a tela fala em
`string | null`, o componente cuida do objeto da opção.

**Páginas de referência** — copie a estrutura ao criar uma tela nova:

| Tela | O que demonstra |
|---|---|
| `app/(auth)/municipios/page.tsx` | listagem, busca com debounce, filtro por relacionamento, paginação offset, filtros na URL, página fora do intervalo |
| `app/(auth)/estados/page.tsx` | listagem simples, sem paginação, ordenação no cliente |
| `app/(auth)/historico/page.tsx` | gate por papel, filtros, sheet de detalhe (botão "Ver detalhes" + clique na linha) |
| `app/(auth)/usuarios/page.tsx` | mutations via `authClient` (criar/editar/banir/remover), troca de papel otimista com confirmação, `ConfirmacaoDialog`, sheet de formulário |
| `app/(auth)/papeis/page.tsx` | CRUD completo via `fetchData` (POST/PATCH/PUT/DELETE), editor de linhas dinâmicas |

`/dashboard` é de propósito uma página em branco: é o ponto de partida do
projeto que usar o template.

### `fetchData`

```ts
fetchData<T>(path, { method?, query?, body?, signal?, formData? })

fetchData<Envelope<Produto[]>>("/produtos", { query: { limit, offset, nome: termo, sort }, signal });
fetchData("/produtos", { method: "POST", body: dados });
fetchData(`/produtos/${id}`, { method: "PATCH", body: dados });
fetchData(`/produtos/${id}`, { method: "DELETE" });
fetchData("/arquivos", { method: "POST", formData });
```

- Prefixo automático via `env.API_URL`; cookie de sessão em toda chamada
  (não existe parâmetro de token)
- `method` default `GET`; `query` é um objeto serializado com `URLSearchParams`
  (`undefined`, `null` e `""` ficam de fora — passe os filtros direto, sem `if`);
  `body` vai como JSON sempre que for `!== undefined`; `formData` (um `FormData`)
  vai como multipart sem Content-Type
- `signal`: repasse o do `queryFn` (`queryFn: ({ signal }) => fetchData(…, { signal })`)
  em **toda listagem** — trocar filtro/página cancela a request anterior
- `204` devolve `undefined` (DELETE não tem corpo)
- `401` (sessão expirada) → redireciona para `/logout?next=<tela atual>&motivo=expirada`;
  `403` **não** desloga — é falta de permissão do papel e a tela mostra o erro
- `!ok` → lança um `Error` de verdade (`ErroApi`: `message` = `erros[0]` ??
  `message` ?? "Erro <status> na API") com os campos do JSON, o **`status`** e o
  `requestId` (`x-request-id` da API, quando o CORS o expõe) anexados; o retry global
  do React Query (queryProvider) usa o status para não repetir 4xx. Na tela `/login`
  o 401 não redireciona.
- Falha de rede (API fora do ar) → `ErroApi` com `status: 0` e
  `message` "Sem conexão com o servidor"
- Erros vão para `lib/logger.ts` → `POST /logs` da API → pino do backend
  (arquivo/stdout/OpenObserve, stream "frontend"): **4xx é `warn`, 5xx e rede são
  `error`**; campos sensíveis são sanitizados; todo log leva o `userId` da sessão
  (`setUsuarioAtual()` no layout `(auth)`) e o `requestId` quando houver.
  `components/error-reporter.tsx` (layout raiz) captura `window.onerror` e
  `unhandledrejection`; os error boundaries (`app/(auth)/error.tsx` dentro do shell,
  `app/error.tsx` nas telas públicas, `app/global-error.tsx` para o layout raiz)
  registram o erro de render e oferecem "Tentar novamente" / "Voltar" / "Ir para o
  início" (`/`, que o proxy despacha — sem `/dashboard` fixo).
- `mensagemDeErro(erro, padrao)` extrai a mensagem exibível (403 → "Sem permissão para
  esta ação.") — use sempre este helper no `onError` de mutations com `fetchData`; para
  o `authClient`, `mensagemErroAuth`.

### Envelope e paginação

A API responde sempre `{ data, meta, erros }`. Nas listagens paginadas,
`meta` é `{ total, limit, offset }`:

```ts
const total = data?.meta.total;
const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;
```

Use `usePagination()` → `{ page, setPage, limit, setLimit, offset }` (`page` e
`limit` na URL via nuqs; `limit` validado contra `PAGE_SIZES`, e `setLimit`
volta para a página 1) + o rodapé inline da página (contagem, `NativeSelect` com
`PAGE_SIZES` e `DataPagination`). **Toda `queryKey` que usa `limit` inclui `limit`.**

### Formatação (`lib/formato.ts`)

`dataHora(iso)`, `data(iso)` (fuso de `NEXT_PUBLIC_TIMEZONE` ou do navegador),
`numero(n)` ("5.570") e `moeda(centavos)` ("R$ 12,34" — a API só fala em centavos).
Sem valor, todos devolvem "—". Helper novo entra aqui, não na tela.

### Formulários

- Sheet lateral para criar/editar; para confirmar ação destrutiva use
  `<ConfirmacaoDialog confirmacao={…} onFechar={…}>` (`components/confirmacao-dialog.tsx`):
  a tela guarda só o registro em questão (`useState<Registro | null>`) e monta o
  objeto `Confirmacao` (`titulo`, `descricao`, `textoConfirmar`, `destrutivo`,
  `pendente: mutation.isPending`, `onConfirmar`, `children` opcional) **no
  render**, para `pendente` acompanhar a mutation. Ação sensível não destrutiva
  (entrar/sair de admin em `/usuarios`) usa o mesmo diálogo.
- Cadastro/edição no painel usa `react-hook-form` + `zodResolver` (zod v4),
  como em `usuarios/page.tsx` e `papeis/page.tsx`: schema no topo do arquivo com
  mensagens em pt-BR, erro inline por campo (`aria-invalid`, `aria-describedby`,
  `<p role="alert">`), `erros[]` de um 400 da API num bloco `role="alert"` no
  topo, submit `disabled={salvar.isPending}` com `<Spinner /> Salvando…` e
  botão Cancelar. Só as telas públicas de autenticação (login, registrar,
  recuperar/definir senha, trocar senha) ficam com `useState`.
- **Atualização otimista** (quando a resposta é previsível, ex.: trocar o papel):
  `onMutate` cancela a query, guarda `getQueryData(chave)`, aplica `setQueryData`;
  `onError` devolve o snapshot; `onSettled` invalida. A `chave` é a **mesma** da lista
  (com os filtros), montada uma vez no componente.
- **Não sincronize formulário com `useEffect`.** O lint (`react-hooks/set-state-in-effect`)
  recusa `setState` dentro de efeito. O padrão do projeto é montar o formulário
  só enquanto o sheet está aberto e usar `key` para remontá-lo:

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent>
    <SheetHeader>…</SheetHeader>
    {registro && <Formulario key={registro.id} registro={registro} />}
  </SheetContent>
</Sheet>
```

Assim o estado inicial sai direto das props e não há efeito de reset.

- Inputs numéricos: `z.number()` + `register(name, { valueAsNumber: true })`
  (não use `z.coerce` no resolver — quebra no zod v4).
- Com máscara: `FormValues = z.input` / `FormOutput = z.output`.
- Esqueleto completo de cadastro/edição (Sheet + `Formulario` local, mutation, ARIA): skill `form-pattern`.

### Types da API

Gerados em `types/api.d.ts` com `bun run types` (exporta o OpenAPI do backend e
converte) — **nunca edite à mão**. Use `components["schemas"]["Nome"]`. O envelope
`{ data, meta, erros }` é o tipo `Envelope<T, M>` de `types/envelope.ts` (escrito à
mão, ao lado do gerado). As rotas do better-auth (`/auth/*`) entram no mesmo arquivo,
mas quem fala com elas é o `authClient`, não o `fetchData`; o usuário do plugin admin
é `UserWithRole` de `better-auth/plugins/admin` (sem tipo escrito à mão).

### Componentes UI

`components/ui/` é shadcn (primitivos do `@base-ui/react`: `render={…}` em vez
de `asChild`, e `nativeButton={false}` no `Button` que renderiza um `Link`).
Adicionar novos com:

```bash
bunx shadcn@latest add <componente> --yes
```

Confira o import gerado: o CLI às vezes escreve `from "cn"`; aqui é
`from "@/lib/utils"`. Texto `sr-only`/`aria-label` que vier em inglês ("Close",
"More") é traduzido no componente. `card`, `checkbox` e `chart` ficam no template
mesmo sem uso (as skills os citam); componente de `ui/` sem uso e fora dessa lista
sai.

Helpers fora de `ui/`: `PageLayout` (cabeçalho + breadcrumb com o grupo do
menu), `ConfirmacaoDialog`, `Seletor`, `Logo`, `ErrorReporter` (layout raiz),
`AmbientePill` (layout raiz) e `ScrollToTop` (layout `(auth)`, botão "Voltar ao
topo" após 300px, via `useSyncExternalStore`). O layout `(auth)` lê o cookie
`sidebar_state` e passa `defaultOpen` ao `SidebarProvider` — o menu abre como o
usuário deixou.

### Landmarks

`SidebarInset` é o `<main>` do shell; `AuthShell`, `not-found` e os `error.tsx`
públicos têm o seu próprio `<main>`. Um `h1` por tela, via `PageLayout title`.
