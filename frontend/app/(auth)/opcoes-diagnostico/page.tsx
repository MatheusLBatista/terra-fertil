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

type OpcaoDiagnostico = components["schemas"]["OpcaoDiagnostico"];
type Grupo = OpcaoDiagnostico["grupo"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

// Sem `sort` a API já devolve como no questionário (grupo → ordem → nome); "grupo:asc"
// explícito desempataria pelo id, então o padrão não vai na URL nem na request.
const SORT_PADRAO = "grupo:asc";

const GRUPOS: { valor: Grupo; rotulo: string }[] = [
  { valor: "atividade_produtiva", rotulo: "Atividade produtiva" },
  { valor: "problema_solo", rotulo: "Problema de solo" },
  { valor: "tema_capacitacao", rotulo: "Tema de capacitação" },
  { valor: "parceiro_institucional", rotulo: "Parceiro institucional" },
  { valor: "apoio_necessario", rotulo: "Apoio necessário" },
];
const rotuloGrupo = (g: Grupo) => GRUPOS.find((x) => x.valor === g)?.rotulo ?? g;

const schema = z.object({
  grupo: z.enum(GRUPOS.map((g) => g.valor) as [Grupo, ...Grupo[]], "Escolha o grupo"),
  nome: z.string().trim().min(1, "Informe o nome").max(200, "No máximo 200 caracteres"),
  permiteDetalhe: z.boolean(),
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

export default function OpcoesDiagnosticoPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const gestor = podeGerenciar("gestor");
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [grupo, setGrupo] = useQueryState("grupo", parseAsString.withDefault(""));
  const [ativo, setAtivo] = useQueryState("ativo", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(""));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = (sort || SORT_PADRAO).split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<OpcaoDiagnostico | null>(null);
  const [excluir, setExcluir] = useState<OpcaoDiagnostico | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const opcoes = useQuery({
    queryKey: ["opcoes-diagnostico", { termo, grupo, ativo, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<OpcaoDiagnostico[], MetaPaginacao>>("/opcoes-diagnostico", {
        query: { limit, offset, sort, busca: termo, grupo, ativo },
        signal,
      }),
  });
  const linhas = opcoes.data?.data ?? [];
  const total = opcoes.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/opcoes-diagnostico/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Opção excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["opcoes-diagnostico"] });
    },
    onError: (erro) => {
      if ((erro as ErroApi).meta?.codigo === "OPCAO_DIAGNOSTICO_EM_USO") {
        setExcluir(null);
        toast.error(
          "Esta opção já foi marcada em diagnósticos ou usada como tema de evento e não pode ser excluída. Edite-a e desmarque “Ativa” para tirá-la dos questionários.",
        );
        return;
      }
      toast.error(mensagemDeErro(erro, "Não foi possível excluir a opção."));
    },
  });

  const colunas = useMemo<ColumnDef<typeof features, OpcaoDiagnostico>[]>(
    () => [
      {
        accessorKey: "grupo",
        header: "Grupo",
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => <span className="text-muted-foreground">{rotuloGrupo(row.original.grupo)}</span>,
      },
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
        // No celular o grupo (coluna escondida) aparece embaixo do nome
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.nome}</span>
            <span className="text-xs text-muted-foreground md:hidden">{rotuloGrupo(row.original.grupo)}</span>
          </div>
        ),
      },
      {
        accessorKey: "permiteDetalhe",
        header: "Pede texto",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) =>
          row.original.permiteDetalhe ? (
            <span title="Ao marcar esta opção, a pessoa descreve qual (como em “Outro”)">Sim</span>
          ) : (
            <span className="text-muted-foreground">Não</span>
          ),
      },
      {
        accessorKey: "ativo",
        header: "Situação",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.ativo ? "default" : "secondary"}>
            {row.original.ativo ? "Ativa" : "Inativa"}
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
            } satisfies ColumnDef<typeof features, OpcaoDiagnostico>,
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
          "A opção sai dos questionários de diagnóstico. Se ela já foi marcada em algum diagnóstico ou usada como tema de evento, desative-a em vez de excluir.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Opções de diagnóstico"
      actions={
        gestor && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Nova opção
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
          aria-label="Filtrar por grupo"
          value={grupo}
          onChange={(e) => {
            void setGrupo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todos os grupos</NativeSelectOption>
          {GRUPOS.map((g) => (
            <NativeSelectOption key={g.valor} value={g.valor}>
              {g.rotulo}
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
          <NativeSelectOption value="">Ativas e inativas</NativeSelectOption>
          <NativeSelectOption value="true">Só ativas</NativeSelectOption>
          <NativeSelectOption value="false">Só inativas</NativeSelectOption>
        </NativeSelect>
        {(termo || grupo || ativo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setGrupo(null);
              void setAtivo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={opcoes.isPending}>
        <Table aria-label="Lista de opções de diagnóstico" ref={tabelaRef} tabIndex={-1}>
          <TableHeader>
            {table.getHeaderGroups().map((cabecalho) => (
              <TableRow key={cabecalho.id}>
                {cabecalho.headers.map((header) => {
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
            {opcoes.isPending ? (
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
            ) : opcoes.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(opcoes.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as opções.{" "}
                      <Button variant="link" size="sm" onClick={() => opcoes.refetch()}>
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
                    "Nenhuma opção encontrada"
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

        {(opcoes.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {opcoes.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} opções`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} opções`}
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
            <SheetTitle>Nova opção de diagnóstico</SheetTitle>
            <SheetDescription>
              A opção aparece no grupo escolhido dos questionários de diagnóstico.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioOpcao grupoInicial={grupo} onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar opção de diagnóstico</SheetTitle>
            <SheetDescription>
              Desmarque “Ativa” para tirar a opção dos questionários sem perder o que já foi respondido.
            </SheetDescription>
          </SheetHeader>
          {editar && <FormularioOpcao key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioOpcao({
  registro,
  grupoInicial,
  onFechar,
}: {
  registro?: OpcaoDiagnostico;
  grupoInicial?: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      grupo: registro?.grupo ?? (GRUPOS.find((g) => g.valor === grupoInicial)?.valor as Grupo),
      nome: registro?.nome ?? "",
      permiteDetalhe: registro?.permiteDetalhe ?? false,
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
        ? fetchData(`/opcoes-diagnostico/${registro.id}`, { method: "PATCH", body: dados })
        : fetchData("/opcoes-diagnostico", { method: "POST", body: dados }),
    onSuccess: () => {
      toast.success(registro ? "Opção atualizada." : "Opção criada.");
      queryClient.invalidateQueries({ queryKey: ["opcoes-diagnostico"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else if ((erro as ErroApi).status === 409) setErrosApi([mensagemDeErro(erro)]);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a opção."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `opcao-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `opcao-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`opcao-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="opcao-grupo">Grupo</Label>
          <NativeSelect className="w-full" {...campo("grupo")} {...register("grupo")}>
            <NativeSelectOption value="">Selecione…</NativeSelectOption>
            {GRUPOS.map((g) => (
              <NativeSelectOption key={g.valor} value={g.valor}>
                {g.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {erro("grupo")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="opcao-nome">Nome</Label>
          <Input placeholder="Piscicultura" maxLength={200} {...campo("nome")} {...register("nome")} />
          {erro("nome")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="opcao-ordem">Ordem no grupo</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="w-32"
            {...campo("ordem")}
            aria-describedby={errors.ordem ? "opcao-ordem-erro" : "opcao-ordem-dica"}
            {...register("ordem", { valueAsNumber: true })}
          />
          {errors.ordem ? (
            erro("ordem")
          ) : (
            <p id="opcao-ordem-dica" className="text-xs text-muted-foreground">
              Números menores aparecem primeiro.
            </p>
          )}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <div className="flex items-start gap-2">
              <Controller
                control={control}
                name="permiteDetalhe"
                render={({ field }) => (
                  <Checkbox
                    id="opcao-permiteDetalhe"
                    checked={field.value}
                    aria-describedby="opcao-permiteDetalhe-dica"
                    onCheckedChange={(v) => field.onChange(v)}
                  />
                )}
              />
              <Label htmlFor="opcao-permiteDetalhe">Pede um texto ao ser marcada</Label>
            </div>
            <p id="opcao-permiteDetalhe-dica" className="pl-6 text-xs text-muted-foreground">
              Use na opção “Outro”: quem marca descreve qual é.
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name="ativo"
              render={({ field }) => (
                <Checkbox id="opcao-ativo" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
              )}
            />
            <Label htmlFor="opcao-ativo">Ativa</Label>
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
