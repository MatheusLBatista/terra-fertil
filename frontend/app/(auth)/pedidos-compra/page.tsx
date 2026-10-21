"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Trash2 } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Seletor } from "@/components/seletor";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData, mensagemDeErro } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, moeda, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type PedidoCompra = components["schemas"]["PedidoCompra"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type Situacao = PedidoCompra["situacao"];

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "aberto", rotulo: "Aberto" },
  { valor: "em_compra", rotulo: "Em compra" },
  { valor: "concluido", rotulo: "Concluído" },
  { valor: "cancelado", rotulo: "Cancelado" },
];
const rotuloSituacao = (s: Situacao) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacao = (s: Situacao) =>
  s === "concluido" ? "default" : s === "cancelado" ? "destructive" : "secondary";

const schema = z.object({
  projetoId: z.string().min(1, "Escolha o projeto"),
  numero: z.string().trim().min(1, "Informe o número do pedido").max(60, "No máximo 60 caracteres"),
  descricao: z.string().trim().max(2000, "No máximo 2000 caracteres"),
  fornecedor: z.string().trim().max(200, "No máximo 200 caracteres"),
  situacao: z.enum(["aberto", "em_compra", "concluido", "cancelado"]),
  dataPedido: z.string(),
});
type FormValues = z.infer<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function PedidosCompraPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const gestor = podeGerenciar("gestor");
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [situacao, setSituacao] = useQueryState("situacao", parseAsString.withDefault(""));
  // Sem `sort` na URL vale a ordem da API (os mais recentes primeiro).
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(""));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => (campoOrdenacao ? [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }] : []),
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<PedidoCompra | null>(null);
  const [excluir, setExcluir] = useState<PedidoCompra | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const pedidos = useQuery({
    queryKey: ["pedidos-compra", { termo, projetoId, situacao, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<PedidoCompra[], MetaPaginacao>>("/pedidos-compra", {
        query: { limit, offset, sort, busca: termo, projetoId, situacao },
        signal,
      }),
  });
  const linhas = pedidos.data?.data ?? [];
  const total = pedidos.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/pedidos-compra/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Pedido excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["pedidos-compra"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o pedido.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, PedidoCompra>[]>(
    () => [
      {
        accessorKey: "numero",
        header: "Número",
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.numero}</span>,
      },
      {
        id: "descricao",
        header: "Descrição / fornecedor",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (
          <div className="flex max-w-xs flex-col">
            <span className="truncate">{row.original.descricao ?? "—"}</span>
            {row.original.fornecedor && (
              <span className="truncate text-xs text-muted-foreground">{row.original.fornecedor}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "dataPedido",
        header: "Data",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{dataCalendario(row.original.dataPedido)}</span>,
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={varianteSituacao(row.original.situacao)}>
            {rotuloSituacao(row.original.situacao)}
          </Badge>
        ),
      },
      {
        accessorKey: "totalEntregas",
        header: "Entregas",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) =>
          row.original.totalEntregas > 0 ? (
            <Link
              href={`/entregas?pedidoId=${row.original.id}`}
              className="text-primary underline-offset-4 hover:underline"
              aria-label={`Ver as ${row.original.totalEntregas} entregas do pedido ${row.original.numero}`}
            >
              {numero(row.original.totalEntregas)} {row.original.totalEntregas === 1 ? "entrega" : "entregas"}
            </Link>
          ) : (
            <span className="text-muted-foreground">Nenhuma</span>
          ),
      },
      {
        accessorKey: "valorConsolidadoCentavos",
        header: "Valor consolidado",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => (
          <span className="tabular-nums">{moeda(row.original.valorConsolidadoCentavos)}</span>
        ),
      },
      ...(gestor
        ? [
            {
              id: "acoes",
              header: "Ações",
              meta: { className: "w-24 text-right" },
              cell: ({ row }) => (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Editar"
                    aria-label={`Editar o pedido ${row.original.numero}`}
                    onClick={() => setEditar(row.original)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Excluir"
                    aria-label={`Excluir o pedido ${row.original.numero}`}
                    onClick={() => setExcluir(row.original)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<typeof features, PedidoCompra>,
          ]
        : []),
    ],
    [gestor],
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
        titulo: `Excluir o pedido “${excluir.numero}”?`,
        descricao:
          excluir.totalEntregas > 0
            ? "Este pedido tem entregas ligadas a ele — desvincule-as antes de excluir, ou marque o pedido como cancelado."
            : "O pedido some das listagens, mas continua no histórico.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Pedidos de compra"
      actions={
        gestor && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo pedido
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por número, fornecedor…"
          aria-label="Buscar por número, fornecedor ou descrição"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Seletor
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por projeto"
          placeholder="Todos os projetos"
          vazio="Nenhum projeto encontrado."
          opcoes={projetos.opcoes}
          valor={projetoId}
          disabled={projetos.isPending}
          onValorChange={(valor) => {
            void setProjetoId(valor);
            void setPage(1);
          }}
        />
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por situação"
          value={situacao}
          onChange={(e) => {
            void setSituacao(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todas as situações</NativeSelectOption>
          {SITUACOES.map((s) => (
            <NativeSelectOption key={s.valor} value={s.valor}>
              {s.rotulo}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {(termo || projetoId || situacao) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setProjetoId(null);
              void setSituacao(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={pedidos.isPending}>
        <Table aria-label="Lista de pedidos de compra" ref={tabelaRef} tabIndex={-1}>
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
            {pedidos.isPending ? (
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
            ) : pedidos.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(pedidos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os pedidos de compra.{" "}
                      <Button variant="link" size="sm" onClick={() => pedidos.refetch()}>
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
                    "Nenhum pedido de compra encontrado"
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

        {(pedidos.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {pedidos.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} pedidos`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} pedidos`}
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

      <Sheet open={novoAberto} onOpenChange={setNovoAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Novo pedido de compra</SheetTitle>
            <SheetDescription>
              Um pedido atende várias associações: depois de criá-lo, ligue a ele as entregas que compra.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioPedido onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar pedido {editar?.numero}</SheetTitle>
            <SheetDescription>O valor consolidado vem da soma das entregas do pedido.</SheetDescription>
          </SheetHeader>
          {editar && <FormularioPedido key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioPedido({ registro, onFechar }: { registro?: PedidoCompra; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projetoId: registro?.projetoId ?? projetos.unico ?? "",
      numero: registro?.numero ?? "",
      descricao: registro?.descricao ?? "",
      fornecedor: registro?.fornecedor ?? "",
      situacao: registro?.situacao ?? "aberto",
      dataPedido: registro?.dataPedido ?? "",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: ({ projetoId, ...d }: FormValues) => {
      const body = {
        numero: d.numero,
        descricao: d.descricao || null,
        fornecedor: d.fornecedor || null,
        situacao: d.situacao,
        dataPedido: d.dataPedido || null,
      };
      return registro
        ? fetchData(`/pedidos-compra/${registro.id}`, { method: "PATCH", body })
        : fetchData("/pedidos-compra", { method: "POST", body: { projetoId, ...body } });
    },
    onSuccess: () => {
      toast.success(registro ? "Pedido atualizado." : "Pedido criado.");
      queryClient.invalidateQueries({ queryKey: ["pedidos-compra"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o pedido."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `pedido-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `pedido-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`pedido-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message}
      </p>
    );

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((dados) => {
        setErrosApi([]);
        salvar.mutate(dados);
      })}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {errosApi.length > 0 && (
          <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
            {errosApi.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {!registro && (
          <div className="grid gap-1.5">
            <Label htmlFor="pedido-projetoId">Projeto</Label>
            <NativeSelect
              className="w-full"
              disabled={projetos.isPending}
              {...campo("projetoId")}
              {...register("projetoId")}
            >
              <NativeSelectOption value="">Selecione…</NativeSelectOption>
              {projetos.opcoes.map((p) => (
                <NativeSelectOption key={p.value} value={p.value}>
                  {p.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {erro("projetoId")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pedido-numero">Número</Label>
            <Input placeholder="012/2026" maxLength={60} {...campo("numero")} {...register("numero")} />
            {erro("numero")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pedido-dataPedido">Data do pedido</Label>
            <Input type="date" {...campo("dataPedido")} {...register("dataPedido")} />
            {erro("dataPedido")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pedido-situacao">Situação</Label>
          <NativeSelect className="w-full" {...campo("situacao")} {...register("situacao")}>
            {SITUACOES.map((s) => (
              <NativeSelectOption key={s.valor} value={s.valor}>
                {s.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {erro("situacao")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pedido-fornecedor">Fornecedor</Label>
          <Input maxLength={200} {...campo("fornecedor")} {...register("fornecedor")} />
          {erro("fornecedor")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pedido-descricao">Descrição</Label>
          <Textarea
            placeholder="Tratores e implementos da 1ª entrega"
            {...campo("descricao")}
            {...register("descricao")}
          />
          {erro("descricao")}
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : registro ? (
            "Salvar"
          ) : (
            "Criar"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
