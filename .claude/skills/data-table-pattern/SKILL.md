---
name: data-table-pattern
description: Padrão canônico de tela de listagem no painel (frontend/) — TanStack Table v9 + primitivos de tabela do shadcn (base-ui), filtros/paginação/ordenação na URL via nuqs, dados via TanStack Query lendo o envelope { data, meta, erros }. Use ao criar ou revisar uma tela de lista — "listar X", "tela de X", "tabela de X", "página de X", "grid de X".
---

# data-table-pattern — tela de listagem

Referência viva: `frontend/app/(auth)/municipios/page.tsx` (o que cada bloco faz está em
`reference/page.tsx.md` — sem cópia do código, para não divergir). Leia a tela antes de
escrever a sua; copie a estrutura e troque a entidade. Lista curta sem paginação:
`frontend/app/(auth)/estados/page.tsx`; ordenação pela API (allowlist `SORT_X`): `papeis/page.tsx`
— dela copie o cabeçalho ordenável e o `sorting` memoizado; a consulta e o rodapé dela são exceção
(ver **Exceções** abaixo), assim como a tela `usuarios/page.tsx` inteira, que fala com o better-auth.

## Quando usar

Listagem de uma entidade que a API expõe com `limit`/`offset`, filtros por query e,
opcionalmente, `sort=campo:asc|desc`. Do lado da API (skill `create-routes`) a tela depende de:

| No módulo do back | O que a tela usa |
|---|---|
| `ListXQuerySchema` (`...paginacaoQuery` + filtros) | nomes dos params de filtro |
| `SORT_X` (allowlist de `sortSchema`) | quais colunas ganham ordenação — só essas |
| `meta { total, limit, offset }` (`MetaPaginacao`) | `totalPages` do rodapé |

Sem `SORT_X` no módulo, a tela não tem ordenação (municípios é assim: só paginação).

## Esqueleto (server pagination + filtros + sort na URL)

Exemplo com uma entidade `Produto` (`GET /produtos?nome=&categoriaId=&sort=&limit=&offset=`).
Tudo no arquivo `app/(auth)/produtos/page.tsx`, `"use client"`.

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import {
  flexRender, rowPaginationFeature, rowSortingFeature, tableFeatures, useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Seletor } from "@/components/seletor";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { ehSemPermissao, fetchData } from "@/lib/fetchData";
import { numero } from "@/lib/formato";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Produto = components["schemas"]["Produto"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const SORT_PADRAO = "nome:asc";

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function ProdutosPage() {
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("nome", parseAsString.withDefault(""));
  const [categoriaId, setCategoriaId] = useQueryState("categoriaId", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  // Memoizado: um array novo a cada render faria o useTable recalcular a ordenação à toa.
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const produtos = useQuery({
    queryKey: ["produtos", { termo, categoriaId, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Produto[], MetaPaginacao>>("/produtos", {
        query: { limit, offset, sort, nome: termo, categoriaId },
        signal,
      }),
  });
  const linhas = produtos.data?.data ?? [];
  const total = produtos.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  // Página além do fim (URL antiga, registros removidos): a lista vem vazia
  // mas `total` diz que há dados — a linha vazia oferece a última página.
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  // Memoizado: o `flexRender` monta cada `cell` como componente — um array novo a
  // cada render trocaria o tipo e remontaria as células (o botão focado some).
  const colunas = useMemo<ColumnDef<typeof features, Produto>[]>(
    () => [
      { accessorKey: "id", header: "Código", enableSorting: false, meta: { className: "w-32" },
        cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.id}</span> },
      { accessorKey: "nome", header: "Nome",
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span> },
      // Coluna secundária: some no celular (o `meta.className` vai para <th> e <td>)
      { accessorKey: "categoriaNome", header: "Categoria", enableSorting: false,
        meta: { className: "hidden md:table-cell" } },
      { id: "acoes", header: "Ações", meta: { className: "w-24 text-right" },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${row.original.nome}`}>
              <Pencil className="size-4" />
            </Button>
          </div>
        ) },
    ],
    [],
  );

  const table = useTable({
    features,
    columns: colunas,
    data: linhas,
    manualPagination: true,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const [proxima] = typeof updater === "function" ? updater(sorting) : updater;
      void setSort(proxima ? `${proxima.id}:${proxima.desc ? "desc" : "asc"}` : null);
      void setPage(1);
    },
  });

  return (
    <PageLayout title="Produtos">
      {/* linha de filtros — ver seção abaixo */}
      <div className="border" aria-busy={produtos.isPending}>
        <Table aria-label="Lista de produtos">
          <TableHeader>
            {table.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id}>
                {grupo.headers.map((header) => {
                  const ordenacao = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} className={header.column.columnDef.meta?.className}
                      aria-sort={header.column.getCanSort()
                        ? ordenacao === "asc" ? "ascending" : ordenacao === "desc" ? "descending" : "none"
                        : undefined}>
                      {header.column.getCanSort() ? (
                        <Button variant="ghost" size="sm" className="-ml-2.5" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {ordenacao === "asc" ? <ArrowUp data-icon="inline-end" />
                            : ordenacao === "desc" ? <ArrowDown data-icon="inline-end" />
                            : <ArrowUpDown data-icon="inline-end" className="text-muted-foreground" />}
                        </Button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {produtos.isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={table.getAllColumns().length}>
                    {i === 0 && <span role="status" className="sr-only">Carregando…</span>}
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : produtos.isError ? (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="py-6 text-center text-muted-foreground">
                  {ehSemPermissao(produtos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>Erro ao carregar os produtos.{" "}
                      <Button variant="link" size="sm" onClick={() => produtos.refetch()}>Tentar novamente</Button></>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="py-6 text-center text-muted-foreground">
                  {foraDoIntervalo ? (
                    <>Esta página não existe mais.{" "}
                      <Button variant="link" size="sm" onClick={() => setPage(totalPages)}>Ir para a última página</Button></>
                  ) : "Nenhum produto encontrado"}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {(produtos.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {produtos.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} produtos`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} produtos`}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Itens por página</span>
                <NativeSelect size="sm" aria-label="Itens por página" value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}>
                  {PAGE_SIZES.map((n) => <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
```

Pontos do esqueleto que o revisor confere:

- **Acessibilidade da tabela**: `aria-busy` no wrapper `div.border` enquanto carrega; `<Table aria-label="Lista
  de …">` (toda tabela tem nome); a primeira linha de skeleton leva o `<span role="status" className="sr-only">
  Carregando…</span>` — o leitor de tela anuncia o carregamento, os skeletons em si são mudos.
- **Erro**: `ehSemPermissao(error)` (403) mostra só o texto, **sem** "Tentar novamente" (repetir não muda
  a permissão do papel); qualquer outro erro oferece o `refetch`.
- **Rodapé**: renderizado enquanto carrega (skeleton no lugar da contagem, a tela não pula) **ou** quando
  `total > 0` — inclusive na página fora do intervalo, que mostra "0 de N" e mantém a paginação para sair dali.
  Some só quando a consulta terminou e não há registro nenhum (`total` 0) ou deu erro.
- **`sorting` memoizado** (`useMemo` sobre campo/direção lidos da URL) e passado tanto em `state` quanto
  ao `updater` do `onSortingChange`.

Ordenação: `enableSorting: false` em toda coluna fora de `SORT_X`; a coluna de ações não tem
`accessorKey`, logo já não ordena. O `id` da coluna ordenável é o nome do campo que a API aceita.

**O bloco do cabeçalho ordenável (`aria-sort` + `Button` ghost + ícones Arrow\*) é repetido em cada
página de propósito** — regra do projeto: a tela inteira se lê num arquivo, sem `DataTable`/`SortableHead`
compartilhado. Copie-o de `papeis/page.tsx`; não extraia.

**Colunas no celular**: coluna secundária leva `meta: { className: "hidden md:table-cell" }` — a classe vai
para o `<th>` e o `<td>` (o esqueleto aplica `meta.className` nos dois), a tabela cabe em 375px sem scroll e
a coluna volta a partir de `md`. Coluna-chave (nome) e Ações nunca somem. (As telas do template têm poucas
colunas e ainda não usam; é o padrão para a tela nova que tiver mais de 3–4.)

**Relação na listagem sem N+1**: quando a tabela mostra dados de outra tabela (ex.: permissões do papel),
a API expõe `?incluir=<relacao>` (`GET /papeis?incluir=permissoes` já existe; skill `create-routes`) e a
tela pede `query: { ..., incluir: "permissoes" }` — uma request para a página inteira, nunca uma
`useQuery` por linha.

## Linha de filtros

```tsx
<div className="mb-4 flex flex-wrap items-center gap-2">
  <Input className="h-9 w-full sm:w-64" placeholder="Buscar por nome…" aria-label="Buscar por nome"
    value={busca} onChange={(e) => setBusca(e.target.value)} />
  <Seletor className="h-9 w-full sm:w-64" aria-label="Filtrar por categoria" placeholder="Todas as categorias"
    vazio="Nenhuma categoria encontrada." opcoes={opcoesCategoria} valor={categoriaId}
    disabled={categorias.isPending}
    onValorChange={(valor) => { void setCategoriaId(valor); void setPage(1); }} />
  {(termo || categoriaId) && (
    <Button variant="ghost" size="sm"
      onClick={() => { setBusca(""); void setTermo(null); void setCategoriaId(null); void setPage(1); }}>
      Limpar filtros
    </Button>
  )}
</div>
```

- Todo controle é `h-9 w-full sm:w-64`: `Input` (texto), `Seletor` (relacionamento, opções de outra
  `useQuery`), `NativeSelect` (enum — `<NativeSelectOption value="">Todos…</NativeSelectOption>` primeiro,
  `onChange` grava `e.target.value || null`). Opção de select é sempre `NativeSelectOption`, nunca `<option>` cru.
- A linha de filtros existe mesmo com um filtro só (`/usuarios`: só a busca) — mesmo container, e
  "Limpar filtros" aparece assim que houver filtro ativo.
- Mudou filtro → `setPage(1)`; o `useBuscaDebounce` já faz isso para a busca.
- Filtro na URL é `useQueryState(nome, parseAsString.withDefault(""))`; limpar é `set(null)`.

## Regras (o revisor recusa a tela que fura qualquer uma)

- **`queryFn` recebe `{ signal }` e repassa ao `fetchData`** — trocar filtro/página cancela a
  request anterior; filtros vão em `query` (o `fetchData` ignora `""`/`undefined`, sem `if`).
- **Tudo no `page.tsx`** — colunas, `useTable`, estados da tabela e rodapé. Compartilhados são só
  `DataPagination`, `Seletor`, `useBuscaDebounce`, `usePagination`: a tela inteira se lê num arquivo.
- **Comentários só quando explicam uma decisão não óbvia** — o padrão é documentado aqui, não na tela.
  Nada de `{/* Criar */}`, `{/* Editar */}` sobre o bloco que já se chama `Sheet … Novo produto`, nem
  docstring que repete o nome do componente.
- **`colSpan={table.getAllColumns().length}`** — o número de colunas vem da tabela, nunca digitado.
- **`colunas` em `useMemo`** (ou no topo do arquivo, se não lê nada do componente — `estados`). O
  `flexRender` faz `createElement(cell, props)`: com o array recriado a cada render, toda célula vira um
  componente novo e é **remontada** sempre que a tela re-renderiza (abrir um diálogo, digitar na busca) —
  o botão que abriu o diálogo some e o foco cai no `<body>`. Dependências só estáveis: setters do
  `useState`, `mutation.mutate` (atribua a uma const antes — `const desbanirUsuario = desbanir.mutate`),
  dados vindos do cache (`consulta.data`) e valores primitivos. Não desabilite o controle focado durante
  uma mutation (`disabled={mutation.isPending}` num select da linha): desabilitar tira o foco dele.
- **`useQuery` sem `staleTime`/`gcTime`** — os padrões globais do `queryProvider` valem para todas as telas.
- **Resultado do `useQuery` em objeto nomeado** (`const produtos = useQuery(...)`) — `produtos.isPending`
  lê-se sem renomear campo em tela com várias consultas.
- **`queryKey` = `["recurso", { filtros }]`** — o nome do recurso e depois UM objeto com todos os inputs
  da request (termo, filtros, `sort`, `page`, `limit`). Input fora da key serve página velha do cache; o
  objeto (em vez de posicionais) deixa `invalidateQueries({ queryKey: ["recurso"] })` pegar toda variação
  e a key legível no devtools.
- **`PageLayout` só com `title`** — sem descrição; `breadcrumb` só quando o título é longo
  ("Histórico de alterações" → `breadcrumb="Histórico"`), senão sai do título.
- **shadcn base-ui**: `render={<Link … />}` + `nativeButton={false}` no `Button` que vira link (`asChild` não existe).
- **Ordenação só nas colunas de `SORT_X`** — a API devolve 400 para campo fora da allowlist.
- **Estado vazio distingue "sem resultado" de "página além do fim"** — `foraDoIntervalo`
  (`linhas.length === 0 && total > 0 && page > 1`) mostra "Ir para a última página"
  (`setPage(totalPages)`), como em `municipios/page.tsx` e `historico/page.tsx`; sem isso o usuário
  que excluiu o último item da página 5 fica numa tela vazia sem saída.

## Exceções nas telas do template (não copie como padrão)

- **`papeis/page.tsx` — lista curta, consulta compartilhada.** A consulta não está no `page.tsx`: mora em
  `usePapeisDinamicos()` (`frontend/hooks/use-papeis.ts`) porque os selects de papel de `/usuarios` usam a
  **mesma** `queryKey` — um registro no cache, e criar/renomear um papel atualiza tela e selects juntos.
  Papéis são poucos por natureza, então a consulta pede tudo de uma vez (`limit: LIMITE_PAPEIS`, o teto
  de 200 da API) e a tela **não pagina**; o rodapé lê `meta.total` (exposto pelo hook como `total`) e diz
  "Mostrando os primeiros N de T papéis" se a lista vier cortada. Entidade nova com volume que cresce
  segue o esqueleto acima (consulta no `page.tsx`, `usePagination` + `DataPagination`); só extraia a
  consulta para `hooks/` quando outra tela precisar exatamente da mesma lista.
- **`usuarios/page.tsx` — better-auth, não envelope.** A lista vem de `authClient.admin.listUsers`
  (plugin admin do better-auth), que devolve `{ users, total }` — sem `{ data, meta, erros }` — e ordena
  por `sortBy`/`sortDirection` do próprio better-auth, sem `SORT_X` no backend. O `queryFn` repassa o
  `signal` em `fetchOptions: { signal }` e lança `resposta.error`. Paginação, filtros na URL, estados da
  tabela e rodapé seguem o padrão; o resto é específico do better-auth. Para ordenação via API própria
  a referência é `papeis/page.tsx`.

## Variações

- **Lista curta sem paginação** (`estados/page.tsx`): `tableFeatures({ rowSortingFeature,
  sortedRowModel: createSortedRowModel(), sortFns: { text: sortFn_text } })`, sem `manualSorting`
  nem `state.sorting` — o TanStack ordena no cliente; rodapé é só "Mostrando N estados".
- **Clique na linha abre Sheet** (`historico/page.tsx`): `<TableRow className="cursor-pointer"
  onClick={() => setDetalhe(row.original)}>`; a tela guarda `useState<Registro | null>` e o Sheet
  abre com `open={detalhe !== null}`.
- **Ações com mutation e confirmação** (`usuarios/page.tsx`, `papeis/page.tsx`): `useMutation` com
  `onSuccess: () => { toast.success(...); queryClient.invalidateQueries({ queryKey: ["produtos"] }); }`
  (prefixo da key da lista, sem os filtros); ação destrutiva guarda o registro em `useState<Registro | null>`
  e monta o objeto `Confirmacao` no render, com `pendente: mutation.isPending`, para o `ConfirmacaoDialog`.
  Ação que remove o botão de origem (excluir a linha, banir) passa `focoAposConfirmar: tabelaRef`
  (`<Table ref={tabelaRef} tabIndex={-1}>`) — sem isso o foco cai no `<body>` quando a linha some.
- **Gate por papel** (`historico`, `papeis`, `usuarios`): `const { ehAdmin, carregando } = usePapel()`
  (ou `podeGerenciar("gestor")`, como em `historico`) e
  `if (!carregando && !ehAdmin) return <PageLayout …><EmptyState title="Acesso restrito" … /></PageLayout>`
  — sem o `!carregando` a tela pisca "Acesso restrito" enquanto a sessão carrega. Mesmo `title` (e
  `breadcrumb`) nos dois ramos. A consulta leva `enabled: ehAdmin`; enquanto a sessão carrega ela fica
  `isPending` e a tabela mostra os skeletons.

## Checklist

1. Model e rota na API (skills `design-models` → `create-routes`), com `SORT_X` se a tela ordena.
2. Permissão `read <Subject>` no seed `backend/src/seeds/papeis.ts` + `cd backend && bun run db:seed:papeis`.
   Relação exibida na tabela → `?incluir=` na API, não uma consulta por linha.
3. Item em `NAV_GROUPS` (`frontend/lib/navegacao.ts`) — o `proxy.ts` já protege a rota nova; nada a registrar lá.
4. `app/(auth)/<entidade>/page.tsx` criada seguindo o esqueleto.
5. `bun run types` na raiz (preferido; equivale a `cd frontend && bun run types`) — o export do OpenAPI roda
   offline a partir do código do backend, **não** precisa da API no ar → `cd frontend && bun run check`
   (typecheck + lint + format:check; o `bun run check` da raiz não confere o format do front).
6. Conferir em 375px que só as colunas com `hidden md:table-cell` somem e nada vaza.
7. Skill `ui-verify` com `ROTAS=/<entidade>` e leitura dos prints.
