"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import {
  flexRender,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { toast } from "react-toastify";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Seletor } from "@/components/seletor";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData, mensagemDeErro } from "@/lib/fetchData";
import { numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";
import { FormularioAssociacao, useMunicipiosRO, type Associacao } from "./formulario-associacao";

type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const SORT_PADRAO = "sigla:asc";

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function AssociacoesPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar, podeEditarCampo } = usePapel();
  const gestor = podeGerenciar("gestor");
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [municipioId, setMunicipioId] = useQueryState("municipioId", parseAsString.withDefault(""));
  const [ativo, setAtivo] = useQueryState("ativo", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const projetos = useProjetos();
  const municipios = useMunicipiosRO();

  const [novaAberta, setNovaAberta] = useState(false);
  const [editar, setEditar] = useState<Associacao | null>(null);
  const [excluir, setExcluir] = useState<Associacao | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const associacoes = useQuery({
    queryKey: ["associacoes", { termo, projetoId, municipioId, ativo, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { limit, offset, sort, busca: termo, projetoId, municipioId, ativo },
        signal,
      }),
  });
  const linhas = associacoes.data?.data ?? [];
  const total = associacoes.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/associacoes/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Associação excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["associacoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a associação.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Associacao>[]>(
    () => [
      {
        accessorKey: "sigla",
        header: "Sigla",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col whitespace-normal">
            <span className="font-medium">
              {row.original.sigla}
              {!row.original.ativo && (
                <Badge variant="secondary" className="ml-2 sm:hidden">
                  Inativa
                </Badge>
              )}
            </span>
            {row.original.nome && (
              <span className="line-clamp-2 text-xs text-muted-foreground">{row.original.nome}</span>
            )}
          </div>
        ),
      },
      {
        id: "municipio",
        accessorKey: "municipioNome",
        header: "Município",
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => `${row.original.municipioNome}/${row.original.uf}`,
      },
      {
        accessorKey: "numProdutores",
        header: "Produtores",
        meta: { className: "hidden text-right sm:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{numero(row.original.numProdutores)}</span>,
      },
      {
        accessorKey: "numFamilias",
        header: "Famílias",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{numero(row.original.numFamilias)}</span>,
      },
      {
        accessorKey: "ativo",
        header: "Situação",
        enableSorting: false,
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={row.original.ativo ? "default" : "secondary"}>
              {row.original.ativo ? "Ativa" : "Inativa"}
            </Badge>
            {row.original.dadosRevisados && <Badge variant="outline">dados revisados</Badge>}
          </div>
        ),
      },
      {
        id: "acoes",
        header: "Ações",
        enableSorting: false,
        meta: { className: "w-28 text-right" },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Abrir contatos, documentos e diagnóstico"
              aria-label={`Abrir ${row.original.sigla}`}
              nativeButton={false}
              render={<Link href={`/associacoes/${row.original.id}`} />}
            >
              <Eye className="size-4" />
            </Button>
            {podeEditarCampo && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Editar"
                aria-label={`Editar ${row.original.sigla}`}
                onClick={() => setEditar(row.original)}
              >
                <Pencil className="size-4" />
              </Button>
            )}
            {gestor && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Excluir"
                aria-label={`Excluir ${row.original.sigla}`}
                onClick={() => setExcluir(row.original)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [gestor, podeEditarCampo],
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

  const confirmacaoExcluir: Confirmacao | null = excluir
    ? {
        titulo: `Excluir a associação “${excluir.sigla}”?`,
        descricao:
          "Só é possível excluir uma associação sem propriedades cadastradas e que não participe de nenhum projeto. Se ela já foi usada, edite e desmarque “Associação ativa”.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const temFiltro = termo || projetoId || municipioId || ativo;

  return (
    <PageLayout
      title="Associações"
      actions={
        podeEditarCampo && (
          <Button onClick={() => setNovaAberta(true)}>
            <Plus className="size-4" /> Nova associação
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por sigla, nome ou CNPJ…"
          aria-label="Buscar por sigla, nome ou CNPJ"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Seletor
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por projeto"
          placeholder="Todos os projetos"
          opcoes={projetos.opcoes}
          valor={projetoId}
          onValorChange={(v) => {
            void setProjetoId(v);
            void setPage(1);
          }}
          vazio="Nenhum projeto encontrado."
        />
        <Seletor
          className="h-9 w-full sm:w-56"
          aria-label="Filtrar por município"
          placeholder="Todos os municípios"
          opcoes={municipios.opcoes}
          valor={municipioId}
          onValorChange={(v) => {
            void setMunicipioId(v);
            void setPage(1);
          }}
          vazio="Nenhum município encontrado."
        />
        <NativeSelect
          className="h-9 w-full sm:w-40"
          aria-label="Filtrar por situação"
          value={ativo}
          onChange={(e) => {
            void setAtivo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Ativas e inativas</NativeSelectOption>
          <NativeSelectOption value="true">Só ativas</NativeSelectOption>
          <NativeSelectOption value="false">Só inativas</NativeSelectOption>
        </NativeSelect>
        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setProjetoId(null);
              void setMunicipioId(null);
              void setAtivo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={associacoes.isPending}>
        <Table aria-label="Lista de associações" ref={tabelaRef} tabIndex={-1}>
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
            {associacoes.isPending ? (
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
            ) : associacoes.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(associacoes.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as associações.{" "}
                      <Button variant="link" size="sm" onClick={() => associacoes.refetch()}>
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
                    "Nenhuma associação encontrada"
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

        {(associacoes.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {associacoes.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} associações`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} associações`}
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

      <Sheet open={novaAberta} onOpenChange={setNovaAberta}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Nova associação</SheetTitle>
            <SheetDescription>
              Depois de cadastrar, abra a associação para registrar contatos, documentos e o diagnóstico.
            </SheetDescription>
          </SheetHeader>
          {novaAberta && <FormularioAssociacao onFechar={() => setNovaAberta(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Editar {editar?.sigla}</SheetTitle>
            <SheetDescription>
              O cadastro é o mesmo em todos os projetos de que ela participa.
            </SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioAssociacao key={editar.id} registro={editar} onFechar={() => setEditar(null)} />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}
