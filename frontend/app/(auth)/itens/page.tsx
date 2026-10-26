"use client";

import { useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { ehSemPermissao, fetchData, mensagemDeErro } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { moeda, numero } from "@/lib/formato";
import { centavosDeTexto, textoDeCentavos } from "@/lib/dinheiro";
import { usePapel } from "@/lib/papeis";
import { CATEGORIAS_ITEM, rotuloCategoriaItem } from "@/lib/itens";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Item = components["schemas"]["Item"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type Tipo = Item["tipo"];

const SORT_PADRAO = "descricao:asc";

const TIPOS: { valor: Tipo; rotulo: string }[] = [
  { valor: "investimento", rotulo: "Investimento" },
  { valor: "custeio", rotulo: "Custeio" },
];
const rotuloTipo = (t: Tipo) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;

const schema = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição").max(300, "No máximo 300 caracteres"),
  tipo: z.enum(["investimento", "custeio"], { error: "Escolha o tipo" }),
  categoria: z.enum(["insumo", "maquina", "implemento", "equipamento"], { error: "Escolha a categoria" }),
  unidade: z.string().trim().min(1, "Informe a unidade").max(20, "No máximo 20 caracteres"),
  valorReferenciaCentavos: z
    .string()
    .transform((v) => centavosDeTexto(v))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Valor inválido (ex.: 1.234,56)"),
  ativo: z.boolean(),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function ItensPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const gestor = podeGerenciar("gestor");
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [tipo, setTipo] = useQueryState("tipo", parseAsString.withDefault(""));
  const [categoria, setCategoria] = useQueryState("categoria", parseAsString.withDefault(""));
  const [ativo, setAtivo] = useQueryState("ativo", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Item | null>(null);
  const [excluir, setExcluir] = useState<Item | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const itens = useQuery({
    queryKey: ["itens", { termo, tipo, categoria, ativo, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Item[], MetaPaginacao>>("/itens", {
        query: { limit, offset, sort, busca: termo, tipo, categoria, ativo },
        signal,
      }),
  });
  const linhas = itens.data?.data ?? [];
  const total = itens.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/itens/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Item excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["itens"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o item.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Item>[]>(
    () => [
      {
        accessorKey: "descricao",
        header: "Descrição",
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => <span className="font-medium">{row.original.descricao}</span>,
      },
      {
        accessorKey: "categoria",
        header: "Categoria",
        cell: ({ row }) => rotuloCategoriaItem(row.original.categoria),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => rotuloTipo(row.original.tipo),
      },
      {
        accessorKey: "unidade",
        header: "Unidade",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
      },
      {
        accessorKey: "valorReferenciaCentavos",
        header: "Valor de referência",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => (
          <span className="tabular-nums">{moeda(row.original.valorReferenciaCentavos)}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Situação",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.ativo ? "default" : "secondary"}>
            {row.original.ativo ? "Ativo" : "Inativo"}
          </Badge>
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
                    aria-label={`Editar ${row.original.descricao}`}
                    onClick={() => setEditar(row.original)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Excluir"
                    aria-label={`Excluir ${row.original.descricao}`}
                    onClick={() => setExcluir(row.original)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<typeof features, Item>,
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
        titulo: `Excluir “${excluir.descricao}”?`,
        descricao:
          "Só é possível excluir um item que nunca foi destinado a uma associação. Item já usado deve ser desativado.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Itens"
      actions={
        gestor && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo item
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por descrição…"
          aria-label="Buscar por descrição"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por tipo"
          value={tipo}
          onChange={(e) => {
            void setTipo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todos os tipos</NativeSelectOption>
          {TIPOS.map((t) => (
            <NativeSelectOption key={t.valor} value={t.valor}>
              {t.rotulo}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por categoria"
          value={categoria}
          onChange={(e) => {
            void setCategoria(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todas as categorias</NativeSelectOption>
          {CATEGORIAS_ITEM.map((c) => (
            <NativeSelectOption key={c.valor} value={c.valor}>
              {c.rotulo}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por situação"
          value={ativo}
          onChange={(e) => {
            void setAtivo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Ativos e inativos</NativeSelectOption>
          <NativeSelectOption value="true">Só ativos</NativeSelectOption>
          <NativeSelectOption value="false">Só inativos</NativeSelectOption>
        </NativeSelect>
        {(termo || tipo || categoria || ativo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setTipo(null);
              void setCategoria(null);
              void setAtivo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={itens.isPending}>
        <Table aria-label="Lista de itens" ref={tabelaRef} tabIndex={-1}>
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
            {itens.isPending ? (
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
            ) : itens.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(itens.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os itens.{" "}
                      <Button variant="link" size="sm" onClick={() => itens.refetch()}>
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
                    "Nenhum item encontrado"
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

        {(itens.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {itens.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} itens`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} itens`}
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
            <SheetTitle>Novo item</SheetTitle>
            <SheetDescription>
              O catálogo é compartilhado por todos os projetos: cadastre cada máquina, implemento ou insumo
              uma vez só.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioItem onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar item</SheetTitle>
            <SheetDescription>
              Item inativo não aparece para novas entregas; as já registradas ficam.
            </SheetDescription>
          </SheetHeader>
          {editar && <FormularioItem key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioItem({ registro, onFechar }: { registro?: Item; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: registro?.descricao ?? "",
      tipo: registro?.tipo ?? "investimento",
      categoria: registro?.categoria ?? "maquina",
      unidade: registro?.unidade ?? "un",
      valorReferenciaCentavos: textoDeCentavos(registro?.valorReferenciaCentavos),
      ativo: registro?.ativo ?? true,
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (body: FormOutput) =>
      registro
        ? fetchData(`/itens/${registro.id}`, { method: "PATCH", body })
        : fetchData("/itens", { method: "POST", body }),
    onSuccess: () => {
      toast.success(registro ? "Item atualizado." : "Item criado.");
      queryClient.invalidateQueries({ queryKey: ["itens"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o item."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `item-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `item-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`item-${nome}-erro`} role="alert" className="text-xs text-destructive">
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

        <div className="grid gap-1.5">
          <Label htmlFor="item-descricao">Descrição</Label>
          <Input
            placeholder="Trator 75 cv 4x4"
            maxLength={300}
            {...campo("descricao")}
            {...register("descricao")}
          />
          {erro("descricao")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="item-categoria">Categoria</Label>
            <NativeSelect className="w-full" {...campo("categoria")} {...register("categoria")}>
              {CATEGORIAS_ITEM.map((c) => (
                <NativeSelectOption key={c.valor} value={c.valor}>
                  {c.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {erro("categoria")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="item-tipo">Tipo</Label>
            <NativeSelect className="w-full" {...campo("tipo")} {...register("tipo")}>
              {TIPOS.map((t) => (
                <NativeSelectOption key={t.valor} value={t.valor}>
                  {t.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {erro("tipo")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="item-unidade">Unidade</Label>
          <Input placeholder="un, t, kg…" maxLength={20} {...campo("unidade")} {...register("unidade")} />
          {erro("unidade")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="item-valorReferenciaCentavos">Valor de referência (R$, opcional)</Label>
          <Input
            inputMode="decimal"
            placeholder="250.000,00"
            {...campo("valorReferenciaCentavos")}
            {...register("valorReferenciaCentavos")}
          />
          {erro("valorReferenciaCentavos")}
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <Checkbox id="item-ativo" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
            )}
          />
          <Label htmlFor="item-ativo">Ativo (disponível para novas entregas)</Label>
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
