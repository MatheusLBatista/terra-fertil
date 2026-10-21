# Referência — `frontend/app/(auth)/municipios/page.tsx`

**Leia o arquivo real**: `frontend/app/(auth)/municipios/page.tsx`. Este documento não copia
o código (uma cópia diverge da tela em poucos commits); ele diz o que procurar em cada bloco,
de cima para baixo.

| # | Bloco | O que observar |
|---|---|---|
| 1 | **Imports e tipos** | `"use client"`; tipos vêm do OpenAPI gerado (`components["schemas"]["Municipio"]`, `MetaPaginacao` tipa o `meta` do envelope). Nada de tipo escrito à mão para a entidade. |
| 2 | **`features` fora do componente** | `tableFeatures({ rowPaginationFeature, columnMeta: {} as { className?: string } })` no topo do arquivo — municípios não tem `SORT_MUNICIPIOS`, por isso não há `rowSortingFeature`; tela com ordenação acrescenta-o (e `manualSorting`). `columnMeta` tipa o `meta.className` das colunas (largura, alinhamento, `hidden md:table-cell`). |
| 3 | **Estado na URL e consultas** | `usePagination()` (page/limit/offset), um `useQueryState` por filtro, busca via `useBuscaDebounce`; consulta de apoio (`estados`) alimenta o `Seletor`; a `queryKey` da lista carrega tudo que entra na request; `queryFn` repassa `{ signal }` ao `fetchData`. |
| 4 | **Colunas e tabela** | `ColumnDef<typeof features, Municipio>[]` dentro do componente, em `useMemo(…, [estados.data])` (a célula de UF fecha sobre a consulta de estados; memoizado para o `flexRender` não remontar as células a cada render); `useTable({ features, columns, data, manualPagination: true })` — quem pagina é a API. Municípios é só leitura: **não tem** coluna de ações. Tela com ações acrescenta a coluna `id: "acoes"` por último, `text-right`, botões em `flex justify-end gap-1` (como em `papeis/page.tsx`). |
| 5 | **Filtros** | `div.mb-4.flex.flex-wrap.items-center.gap-2`; todo controle `h-9 w-full sm:w-64`; mudar filtro volta à página 1; "Limpar filtros" só aparece com filtro ativo. |
| 6 | **Cabeçalho, quatro estados do corpo e rodapé** | wrapper `div.border` com `aria-busy={municipios.isPending}`; `<Table aria-label="Lista de municípios">`; `getHeaderGroups` + `flexRender`; no `<TableBody>`: pendente (5 skeletons, o primeiro com `<span role="status" className="sr-only">Carregando…</span>`), erro (403 via `ehSemPermissao` → só o texto, sem botão; outro erro → mensagem + "Tentar novamente" → `refetch`), vazio ("Nenhum município encontrado" ou, com `foraDoIntervalo`, "Ir para a última página"), dados (`getRowModel().rows` + `getAllCells`); `colSpan={table.getAllColumns().length}`. Rodapé (contagem, `NativeSelect` sobre `PAGE_SIZES`, `DataPagination`) aparece com `isPending \|\| total > 0`: durante o loading (skeleton no lugar da contagem) e sempre que a API diz que há registros — inclusive na página fora do intervalo, onde a contagem vira "0 de N". Some só com `total` 0 ou erro. |

O esqueleto genérico (com ordenação, coluna escondida no celular e "Ir para a última página")
está no `SKILL.md`; a tela real é a fonte de verdade quando os dois divergirem.
