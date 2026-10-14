# Referência — `frontend/app/(auth)/municipios/page.tsx`

**Leia o arquivo real**: `frontend/app/(auth)/municipios/page.tsx`. Este documento não copia
o código (uma cópia diverge da tela em poucos commits); ele diz o que procurar em cada bloco,
de cima para baixo.

| # | Bloco | O que observar |
|---|---|---|
| 1 | **Imports e tipos** | `"use client"`; tipos vêm do OpenAPI gerado (`components["schemas"]["Municipio"]`, `MetaPaginacao` tipa o `meta` do envelope). Nada de tipo escrito à mão para a entidade. |
| 2 | **`features` fora do componente** | `tableFeatures({ rowPaginationFeature, columnMeta: {} as { className?: string } })` no topo do arquivo — municípios não tem `SORT_MUNICIPIOS`, por isso não há `rowSortingFeature`; tela com ordenação acrescenta-o (e `manualSorting`). `columnMeta` tipa o `meta.className` das colunas (largura, alinhamento, `hidden md:table-cell`). |
| 3 | **Estado na URL e consultas** | `usePagination()` (page/limit/offset), um `useQueryState` por filtro, busca via `useBuscaDebounce`; consulta de apoio (`estados`) alimenta o `Seletor`; a `queryKey` da lista carrega tudo que entra na request; `queryFn` repassa `{ signal }` ao `fetchData`. |
| 4 | **Colunas e tabela** | `ColumnDef<typeof features, Municipio>[]` dentro do componente (a célula de UF fecha sobre a consulta de estados); `useTable({ features, columns, data, manualPagination: true })` — quem pagina é a API. Coluna Ações é a última, `text-right`. |
| 5 | **Filtros** | `div.mb-4.flex.flex-wrap.items-center.gap-2`; todo controle `h-9 w-full sm:w-64`; mudar filtro volta à página 1; "Limpar filtros" só aparece com filtro ativo. |
| 6 | **Cabeçalho, quatro estados do corpo e rodapé** | `getHeaderGroups` + `flexRender`; no `<TableBody>`: pendente (5 skeletons), erro (mensagem + "Tentar novamente" → `refetch`), vazio, dados (`getRowModel().rows` + `getAllCells`); `colSpan={table.getAllColumns().length}`; wrapper `div.border` com `aria-busy`; rodapé (contagem, `NativeSelect` sobre `PAGE_SIZES`, `DataPagination`) só com linhas. |

O esqueleto genérico (com ordenação, coluna escondida no celular e "Ir para a última página")
está no `SKILL.md`; a tela real é a fonte de verdade quando os dois divergirem.
