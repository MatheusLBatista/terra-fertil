"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import {
  flexRender,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Eye, ShieldCheck } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { usePagination } from "@/hooks/use-pagination";
import { ehSemPermissao, fetchData } from "@/lib/fetchData";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import { dataHora, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import {
  nomeTabela,
  OPERACOES,
  ROTULO_OPERACAO,
  varianteOperacao,
  type HistoricoAlteracao,
} from "@/lib/historico";
import type { components } from "@/types/api";

type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const features = tableFeatures({
  rowPaginationFeature,
  columnMeta: {} as { className?: string },
});

/**
 * Auditoria: `historico_alteracoes` é populada pela trigger `trg_historico` do
 * PostgreSQL, não pelo código da API. Exige `read HistoricoAlteracao` — no seed
 * de papéis, admin e gestor.
 */
export default function HistoricoPage() {
  const { papel, podeGerenciar } = usePapel();
  const autorizado = podeGerenciar("gestor");

  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [tabela, setTabela] = useQueryState("tabela", parseAsString.withDefault(""));
  const [operacao, setOperacao] = useQueryState("operacao", parseAsString.withDefault(""));
  const [detalhe, setDetalhe] = useState<HistoricoAlteracao | null>(null);

  const tabelas = useQuery({
    queryKey: ["historico", "tabelas"],
    queryFn: ({ signal }) => fetchData<Envelope<string[]>>("/historico/tabelas", { signal }),
    enabled: autorizado,
  });

  const historico = useQuery({
    queryKey: ["historico", { tabela, operacao, page, limit }],
    enabled: autorizado,
    queryFn: ({ signal }) =>
      fetchData<Envelope<HistoricoAlteracao[], MetaPaginacao>>("/historico", {
        query: { limit, offset, tabela, operacao },
        signal,
      }),
  });

  const linhas = historico.data?.data ?? [];
  const total = historico.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const colunas: ColumnDef<typeof features, HistoricoAlteracao>[] = [
    {
      accessorKey: "operacao",
      header: "Operação",
      meta: { className: "w-28" },
      cell: ({ row }) => (
        <Badge variant={varianteOperacao(row.original.operacao)}>
          {ROTULO_OPERACAO[row.original.operacao]}
        </Badge>
      ),
    },
    {
      accessorKey: "tabela",
      header: "Tabela",
      cell: ({ row }) => <span className="font-medium">{nomeTabela(row.original.tabela)}</span>,
    },
    {
      accessorKey: "registroId",
      header: "Registro",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.registroId}</span>
      ),
    },
    {
      accessorKey: "alteradoPor",
      header: "Alterado por",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.alteradoPor ?? "sistema"}</span>
      ),
    },
    {
      accessorKey: "alteradoEm",
      header: "Quando",
      meta: { className: "w-44" },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{dataHora(row.original.alteradoEm)}</span>
      ),
    },
    {
      id: "acoes",
      header: "Ações",
      meta: { className: "w-20 text-right" },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Ver detalhes"
            aria-label={`Ver detalhes da alteração ${row.original.registroId}`}
            onClick={(e) => {
              e.stopPropagation();
              setDetalhe(row.original);
            }}
          >
            <Eye className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useTable({
    features,
    columns: colunas,
    data: linhas,
    manualPagination: true,
  });

  if (!autorizado) {
    return (
      <PageLayout title="Histórico">
        <EmptyState
          icon={ShieldCheck}
          title="Acesso restrito"
          description={`Seu papel (${papel}) não tem permissão de leitura na auditoria.`}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Histórico de alterações" breadcrumb="Histórico">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="Filtrar por tabela"
          className="h-9 w-full sm:w-64"
          value={tabela}
          onChange={(e) => {
            void setTabela(e.target.value || null);
            void setPage(1);
          }}
        >
          <option value="">Todas as tabelas</option>
          {tabelas.data?.data.map((nome) => (
            <option key={nome} value={nome}>
              {nomeTabela(nome)}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Filtrar por operação"
          className="h-9 w-full sm:w-64"
          value={operacao}
          onChange={(e) => {
            void setOperacao(e.target.value || null);
            void setPage(1);
          }}
        >
          <option value="">Todas as operações</option>
          {OPERACOES.map((op) => (
            <option key={op} value={op}>
              {ROTULO_OPERACAO[op]}
            </option>
          ))}
        </NativeSelect>

        {(tabela || operacao) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void setTabela(null);
              void setOperacao(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={historico.isPending}>
        <Table aria-label="Histórico de alterações">
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
            {historico.isPending ? (
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
            ) : historico.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(historico.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar o histórico.{" "}
                      <Button variant="link" size="sm" onClick={() => historico.refetch()}>
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
                    "Nenhuma operação registrada"
                  )}
                </TableCell>
              </TableRow>
            ) : (
              // Clique na linha é atalho de mouse; o teclado usa o botão "Ver detalhes".
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => setDetalhe(row.original)}>
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

        {(historico.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {historico.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} alterações`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} alterações`}
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

      <DetalheAlteracao linha={detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)} />
    </PageLayout>
  );
}

function DetalheAlteracao({
  linha,
  onOpenChange,
}: {
  linha: HistoricoAlteracao | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  return (
    <Sheet open={linha !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {linha ? `${ROTULO_OPERACAO[linha.operacao]} em ${nomeTabela(linha.tabela)}` : ""}
          </SheetTitle>
          <SheetDescription>
            {linha
              ? `Registro ${linha.registroId} · ${dataHora(linha.alteradoEm)} · por ${linha.alteradoPor ?? "sistema"}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {linha && (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Campos titulo="Antes" dados={linha.dadosAnteriores} vazio="Registro criado agora." />
            <Campos titulo="Depois" dados={linha.dadosNovos} vazio="Registro excluído." />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Campos({
  titulo,
  dados,
  vazio,
}: {
  titulo: string;
  dados: Record<string, unknown> | null;
  vazio: string;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">{titulo}</h3>
      {dados ? (
        <pre className="max-h-72 overflow-auto border bg-muted/40 p-3 font-mono text-xs">
          {JSON.stringify(dados, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      )}
    </div>
  );
}
