"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ehSemPermissao, fetchData } from "@/lib/fetchData";
import { numero } from "@/lib/formato";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Estado = components["schemas"]["Estado"];

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
  columnMeta: {} as { className?: string },
});

const colunas: ColumnDef<typeof features, Estado>[] = [
  {
    accessorKey: "id",
    header: "Código IBGE",
    meta: { className: "w-32" },
    cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.id}</span>,
  },
  {
    accessorKey: "sigla",
    header: "UF",
    meta: { className: "w-20" },
    cell: ({ row }) => <span className="font-medium">{row.original.sigla}</span>,
  },
  {
    accessorKey: "nome",
    header: "Nome",
  },
  {
    id: "acoes",
    header: "Municípios",
    meta: { className: "w-40 text-right" },
    cell: ({ row }) => (
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/municipios?estadoId=${row.original.id}`} />}
        >
          Ver municípios
        </Button>
      </div>
    ),
  },
];

export default function EstadosPage() {
  const estados = useQuery({
    queryKey: ["estados"],
    queryFn: ({ signal }) => fetchData<Envelope<Estado[]>>("/estados", { signal }),
  });
  const ufs = estados.data?.data ?? [];

  const table = useTable({
    features,
    columns: colunas,
    data: ufs,
    enableMultiSort: false,
    enableSortingRemoval: false,
  });

  return (
    <PageLayout title="Estados">
      <div className="border" aria-busy={estados.isPending}>
        <Table aria-label="Lista de estados">
          <TableHeader>
            {table.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id}>
                {grupo.headers.map((header) => {
                  const ordenacao = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={header.column.columnDef.meta?.className}
                      aria-sort={
                        header.column.getCanSort()
                          ? ordenacao === "asc"
                            ? "ascending"
                            : ordenacao === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2.5"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {ordenacao === "asc" ? (
                            <ArrowUp data-icon="inline-end" />
                          ) : ordenacao === "desc" ? (
                            <ArrowDown data-icon="inline-end" />
                          ) : (
                            <ArrowUpDown data-icon="inline-end" className="text-muted-foreground" />
                          )}
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {estados.isPending ? (
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
            ) : estados.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(estados.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os estados.{" "}
                      <Button variant="link" size="sm" onClick={() => estados.refetch()}>
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : ufs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  Nenhum estado cadastrado
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

        {(estados.isPending || ufs.length > 0) && (
          <div className="border-t px-4 py-2">
            {estados.isPending ? (
              <Skeleton className="h-3 w-32" />
            ) : (
              <p className="text-xs text-muted-foreground">Mostrando {numero(ufs.length)} estados</p>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
