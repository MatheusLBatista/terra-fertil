"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import {
  flexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
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

type Estado = components["schemas"]["Estado"];
type Municipio = components["schemas"]["Municipio"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const features = tableFeatures({
  rowPaginationFeature,
  columnMeta: {} as { className?: string },
});

export default function MunicipiosPage() {
  const { page, setPage, limit, setLimit, offset } = usePagination();

  const [termo, setTermo] = useQueryState("nome", parseAsString.withDefault(""));
  const [estadoId, setEstadoId] = useQueryState("estadoId", parseAsString.withDefault(""));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);

  const estados = useQuery({
    queryKey: ["estados"],
    queryFn: ({ signal }) => fetchData<Envelope<Estado[]>>("/estados", { signal }),
  });
  const opcoesEstado = (estados.data?.data ?? []).map((estado) => ({
    value: String(estado.id),
    label: `${estado.sigla} — ${estado.nome}`,
  }));

  const municipios = useQuery({
    queryKey: ["municipios", { termo, estadoId, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Municipio[], MetaPaginacao>>("/municipios", {
        query: { limit, offset, nome: termo, estadoId },
        signal,
      }),
  });

  const linhas = municipios.data?.data ?? [];
  const total = municipios.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  // Página além do fim (URL antiga, registros removidos): a lista vem vazia
  // mas `total` diz que há dados — a linha vazia oferece a última página.
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const siglaDe = (id: number) => estados.data?.data.find((e) => e.id === id)?.sigla ?? "—";

  const colunas: ColumnDef<typeof features, Municipio>[] = [
    {
      accessorKey: "id",
      header: "Código IBGE",
      meta: { className: "w-32" },
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.id}</span>,
    },
    {
      accessorKey: "nome",
      header: "Nome",
      cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
    },
    {
      accessorKey: "estadoId",
      header: "UF",
      meta: { className: "w-24" },
      cell: ({ row }) => siglaDe(row.original.estadoId),
    },
  ];

  const table = useTable({
    features,
    columns: colunas,
    data: linhas,
    manualPagination: true,
  });

  return (
    <PageLayout title="Municípios">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por nome…"
          aria-label="Buscar por nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Seletor
          aria-label="Filtrar por estado"
          className="h-9 w-full sm:w-64"
          placeholder="Todos os estados"
          vazio="Nenhum estado encontrado."
          opcoes={opcoesEstado}
          valor={estadoId}
          disabled={estados.isPending}
          onValorChange={(valor) => {
            void setEstadoId(valor);
            void setPage(1);
          }}
        />
        {(termo || estadoId) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setEstadoId(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={municipios.isPending}>
        <Table aria-label="Lista de municípios">
          <TableHeader>
            {table.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id}>
                {grupo.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {municipios.isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={table.getAllColumns().length}>
                    {i === 0 && (
                      <span role="status" className="sr-only">
                        Carregando…
                      </span>
                    )}
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : municipios.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(municipios.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os municípios.{" "}
                      <Button variant="link" size="sm" onClick={() => municipios.refetch()}>
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {foraDoIntervalo ? (
                    <>
                      Esta página não existe mais.{" "}
                      <Button variant="link" size="sm" onClick={() => setPage(totalPages)}>
                        Ir para a última página
                      </Button>
                    </>
                  ) : (
                    "Nenhum município encontrado"
                  )}
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

        {(municipios.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {municipios.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} municípios`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} municípios`}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Itens por página</span>
                <NativeSelect
                  size="sm"
                  aria-label="Itens por página"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  {PAGE_SIZES.map((n) => (
                    <NativeSelectOption key={n} value={n}>
                      {n}
                    </NativeSelectOption>
                  ))}
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
