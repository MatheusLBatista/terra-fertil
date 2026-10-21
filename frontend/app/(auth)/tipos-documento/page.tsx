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
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type TipoDocumento = components["schemas"]["TipoDocumento"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

// Sem `sort` a API já devolve na ordem do checklist (ordem → nome); "ordem:asc" explícito
// desempataria pelo id, então o padrão não vai na URL nem na request.
const SORT_PADRAO = "ordem:asc";

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(200, "No máximo 200 caracteres"),
  obrigatorio: z.boolean(),
  porProjeto: z.boolean(),
  ordem: z
    .number({ error: "Informe a ordem" })
    .int("Use um número inteiro")
    .min(0, "Não pode ser negativa")
    .max(32767, "Número muito grande"),
  ativo: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function TiposDocumentoPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const gestor = podeGerenciar("gestor");
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [ativo, setAtivo] = useQueryState("ativo", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(""));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = (sort || SORT_PADRAO).split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<TipoDocumento | null>(null);
  const [excluir, setExcluir] = useState<TipoDocumento | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const tipos = useQuery({
    queryKey: ["tipos-documento", { termo, ativo, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<TipoDocumento[], MetaPaginacao>>("/tipos-documento", {
        query: { limit, offset, sort, busca: termo, ativo },
        signal,
      }),
  });
  const linhas = tipos.data?.data ?? [];
  const total = tipos.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/tipos-documento/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Tipo de documento excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["tipos-documento"] });
    },
    onError: (erro) => {
      if ((erro as ErroApi).meta?.codigo === "TIPO_DOCUMENTO_EM_USO") {
        setExcluir(null);
        toast.error(
          "Este tipo já tem documentos entregues pelas associações e não pode ser excluído. Edite-o e desmarque “Ativo” para tirá-lo do checklist.",
        );
        return;
      }
      toast.error(mensagemDeErro(erro, "Não foi possível excluir o tipo de documento."));
    },
  });

  const colunas = useMemo<ColumnDef<typeof features, TipoDocumento>[]>(
    () => [
      {
        accessorKey: "ordem",
        header: "Ordem",
        meta: { className: "w-20" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.ordem}</span>,
      },
      {
        accessorKey: "nome",
        header: "Nome",
        meta: { className: "whitespace-normal break-words" },
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "obrigatorio",
        header: "Obrigatório",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (row.original.obrigatorio ? "Sim" : "Não"),
      },
      {
        accessorKey: "porProjeto",
        header: "Por projeto",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.porProjeto ? "Um por projeto" : "Da associação"}
          </span>
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
      // Quem só lê não ganha a coluna de ações (a API recusaria a escrita)
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
                    aria-label={`Editar ${row.original.nome}`}
                    onClick={() => setEditar(row.original)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Excluir"
                    aria-label={`Excluir ${row.original.nome}`}
                    onClick={() => setExcluir(row.original)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<typeof features, TipoDocumento>,
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
      const valor = proxima ? `${proxima.id}:${proxima.desc ? "desc" : "asc"}` : SORT_PADRAO;
      void setSort(valor === SORT_PADRAO ? null : valor);
      void setPage(1);
    },
  });

  const confirmacaoExcluir: Confirmacao | null = excluir
    ? {
        titulo: `Excluir “${excluir.nome}”?`,
        descricao:
          "O tipo sai do checklist de documentos das associações. Se alguma associação já entregou este documento, desative o tipo em vez de excluir.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Tipos de documento"
      actions={
        gestor && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo tipo
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por nome…"
          aria-label="Buscar por nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
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
        {(termo || ativo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setAtivo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={tipos.isPending}>
        <Table aria-label="Lista de tipos de documento" ref={tabelaRef} tabIndex={-1}>
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
            {tipos.isPending ? (
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
            ) : tipos.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(tipos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os tipos de documento.{" "}
                      <Button variant="link" size="sm" onClick={() => tipos.refetch()}>
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
                    "Nenhum tipo de documento encontrado"
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

        {(tipos.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {tipos.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} tipos`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} tipos`}
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
            <SheetTitle>Novo tipo de documento</SheetTitle>
            <SheetDescription>
              O tipo entra no checklist de documentos de todas as associações.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioTipo onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar tipo de documento</SheetTitle>
            <SheetDescription>
              Desmarque “Ativo” para tirar o tipo do checklist sem perder os documentos já entregues.
            </SheetDescription>
          </SheetHeader>
          {editar && <FormularioTipo key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioTipo({ registro, onFechar }: { registro?: TipoDocumento; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: registro?.nome ?? "",
      obrigatorio: registro?.obrigatorio ?? true,
      porProjeto: registro?.porProjeto ?? false,
      ordem: registro?.ordem ?? 0,
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
    mutationFn: (dados: FormValues) =>
      registro
        ? fetchData(`/tipos-documento/${registro.id}`, { method: "PATCH", body: dados })
        : fetchData("/tipos-documento", { method: "POST", body: dados }),
    onSuccess: () => {
      toast.success(registro ? "Tipo de documento atualizado." : "Tipo de documento criado.");
      queryClient.invalidateQueries({ queryKey: ["tipos-documento"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else if ((erro as ErroApi).status === 409) setErrosApi([mensagemDeErro(erro)]);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o tipo de documento."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `tipo-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `tipo-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`tipo-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="tipo-nome">Nome</Label>
          <Input placeholder="Estatuto social" maxLength={200} {...campo("nome")} {...register("nome")} />
          {erro("nome")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="tipo-ordem">Ordem no checklist</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="w-32"
            {...campo("ordem")}
            aria-describedby={errors.ordem ? "tipo-ordem-erro" : "tipo-ordem-dica"}
            {...register("ordem", { valueAsNumber: true })}
          />
          {errors.ordem ? (
            erro("ordem")
          ) : (
            <p id="tipo-ordem-dica" className="text-xs text-muted-foreground">
              Números menores aparecem primeiro.
            </p>
          )}
        </div>

        <div className="grid gap-3">
          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="obrigatorio"
              render={({ field }) => (
                <Checkbox
                  id="tipo-obrigatorio"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v)}
                />
              )}
            />
            <Label htmlFor="tipo-obrigatorio">Obrigatório para a associação participar</Label>
          </div>

          <div className="grid gap-1">
            <div className="flex items-start gap-2">
              <Controller
                control={control}
                name="porProjeto"
                render={({ field }) => (
                  <Checkbox
                    id="tipo-porProjeto"
                    checked={field.value}
                    aria-describedby="tipo-porProjeto-dica"
                    onCheckedChange={(v) => field.onChange(v)}
                  />
                )}
              />
              <Label htmlFor="tipo-porProjeto">Um documento por projeto</Label>
            </div>
            <p id="tipo-porProjeto-dica" className="pl-6 text-xs text-muted-foreground">
              Marque para documentos como o termo de parceria; deixe desmarcado para documentos da própria
              associação, como o estatuto. Não pode mudar depois que houver documentos entregues.
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="ativo"
              render={({ field }) => (
                <Checkbox id="tipo-ativo" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
              )}
            />
            <Label htmlFor="tipo-ativo">Ativo</Label>
          </div>
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
