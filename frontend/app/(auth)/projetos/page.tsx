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
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Trash2 } from "lucide-react";

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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { ehSemPermissao, fetchData, mensagemDeErro } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, moeda, numero } from "@/lib/formato";
import { centavosDeTexto, textoDeCentavos } from "@/lib/dinheiro";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Projeto = components["schemas"]["Projeto"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type Situacao = Projeto["situacao"];

const SORT_PADRAO = "inicio:desc";

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "planejado", rotulo: "Planejado" },
  { valor: "em_execucao", rotulo: "Em execução" },
  { valor: "encerrado", rotulo: "Encerrado" },
];
const rotuloSituacao = (s: Situacao) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;

const schema = z
  .object({
    sigla: z.string().trim().min(1, "Informe a sigla").max(30, "No máximo 30 caracteres"),
    nome: z.string().trim().min(1, "Informe o nome").max(200, "No máximo 200 caracteres"),
    numeroInstrumento: z.string().trim().max(60, "No máximo 60 caracteres"),
    concedente: z.string().trim().max(200, "No máximo 200 caracteres"),
    executor: z.string().trim().max(200, "No máximo 200 caracteres"),
    inicio: z.iso.date("Informe a data de início"),
    fim: z.iso.date("Informe a data de término"),
    valorTotal: z
      .string()
      .transform((v) => centavosDeTexto(v) ?? 0)
      .refine((v) => Number.isFinite(v) && v >= 0, "Valor inválido (ex.: 55.000.000,00)"),
    situacao: z.enum(["planejado", "em_execucao", "encerrado"]),
  })
  .refine((v) => v.fim >= v.inicio, { message: "O término não pode ser antes do início", path: ["fim"] });
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function ProjetosPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const gestor = podeGerenciar("gestor");
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [situacao, setSituacao] = useQueryState("situacao", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Projeto | null>(null);
  const [excluir, setExcluir] = useState<Projeto | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const projetos = useQuery({
    queryKey: ["projetos", { termo, situacao, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Projeto[], MetaPaginacao>>("/projetos", {
        query: { limit, offset, sort, busca: termo, situacao },
        signal,
      }),
  });
  const linhas = projetos.data?.data ?? [];
  const total = projetos.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/projetos/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Projeto excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o projeto.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Projeto>[]>(
    () => [
      {
        accessorKey: "sigla",
        header: "Sigla",
        cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.sigla}</span>,
      },
      // No celular a sigla identifica o projeto; o nome volta a partir de sm
      { accessorKey: "nome", header: "Nome", meta: { className: "hidden sm:table-cell" } },
      {
        accessorKey: "inicio",
        header: "Vigência",
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {dataCalendario(row.original.inicio)} a {dataCalendario(row.original.fim)}
          </span>
        ),
      },
      {
        accessorKey: "valorTotalCentavos",
        header: "Valor",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{moeda(row.original.valorTotalCentavos)}</span>,
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.situacao === "em_execucao" ? "default" : "secondary"}>
            {rotuloSituacao(row.original.situacao)}
          </Badge>
        ),
      },
      {
        id: "acoes",
        header: "Ações",
        meta: { className: "w-32 text-right" },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Ver equipe e associações"
              aria-label={`Abrir ${row.original.sigla}`}
              nativeButton={false}
              render={<Link href={`/projetos/${row.original.id}`} />}
            >
              <Eye className="size-4" />
            </Button>
            {gestor && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Editar"
                  aria-label={`Editar ${row.original.sigla}`}
                  onClick={() => setEditar(row.original)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Excluir"
                  aria-label={`Excluir ${row.original.sigla}`}
                  onClick={() => setExcluir(row.original)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
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
        titulo: `Excluir o projeto “${excluir.sigla}”?`,
        descricao:
          "Só é possível excluir um projeto sem metas, equipe, associações ou registros. Projeto já em andamento deve ser encerrado.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Projetos"
      actions={
        gestor && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo projeto
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por sigla ou nome…"
          aria-label="Buscar por sigla ou nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
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
        {(termo || situacao) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setSituacao(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={projetos.isPending}>
        <Table aria-label="Lista de projetos" ref={tabelaRef} tabIndex={-1}>
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
            {projetos.isPending ? (
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
            ) : projetos.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(projetos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os projetos.{" "}
                      <Button variant="link" size="sm" onClick={() => projetos.refetch()}>
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
                    "Nenhum projeto encontrado"
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

        {(projetos.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {projetos.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} projetos`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} projetos`}
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
            <SheetTitle>Novo projeto</SheetTitle>
            <SheetDescription>
              Depois de criar, abra o projeto para montar a equipe e registrar as associações participantes.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioProjeto onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar projeto</SheetTitle>
            <SheetDescription>Projeto encerrado só aceita mudar a situação (reabrir).</SheetDescription>
          </SheetHeader>
          {editar && <FormularioProjeto key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioProjeto({ registro, onFechar }: { registro?: Projeto; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      sigla: registro?.sigla ?? "",
      nome: registro?.nome ?? "",
      numeroInstrumento: registro?.numeroInstrumento ?? "",
      concedente: registro?.concedente ?? "",
      executor: registro?.executor ?? "",
      inicio: registro?.inicio ?? "",
      fim: registro?.fim ?? "",
      valorTotal: textoDeCentavos(registro?.valorTotalCentavos),
      situacao: registro?.situacao ?? "planejado",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: ({ valorTotal, ...dados }: FormOutput) => {
      const body = {
        ...dados,
        numeroInstrumento: dados.numeroInstrumento || null,
        concedente: dados.concedente || null,
        executor: dados.executor || null,
        valorTotalCentavos: valorTotal,
      };
      return registro
        ? fetchData(`/projetos/${registro.id}`, { method: "PATCH", body })
        : fetchData("/projetos", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(registro ? "Projeto atualizado." : "Projeto criado.");
      queryClient.invalidateQueries({ queryKey: ["projetos"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o projeto."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `projeto-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `projeto-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`projeto-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="projeto-sigla">Sigla</Label>
          <Input placeholder="TERRA-FERTIL" maxLength={30} {...campo("sigla")} {...register("sigla")} />
          {erro("sigla")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="projeto-nome">Nome</Label>
          <Input maxLength={200} {...campo("nome")} {...register("nome")} />
          {erro("nome")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="projeto-inicio">Início</Label>
            <Input type="date" {...campo("inicio")} {...register("inicio")} />
            {erro("inicio")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="projeto-fim">Término</Label>
            <Input type="date" {...campo("fim")} {...register("fim")} />
            {erro("fim")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="projeto-valorTotal">Valor total (R$)</Label>
          <Input
            inputMode="decimal"
            placeholder="55.000.000,00"
            {...campo("valorTotal")}
            {...register("valorTotal")}
          />
          {erro("valorTotal")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="projeto-situacao">Situação</Label>
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
          <Label htmlFor="projeto-numeroInstrumento">Nº do convênio / instrumento</Label>
          <Input maxLength={60} {...campo("numeroInstrumento")} {...register("numeroInstrumento")} />
          {erro("numeroInstrumento")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="projeto-concedente">Concedente</Label>
          <Input maxLength={200} {...campo("concedente")} {...register("concedente")} />
          {erro("concedente")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="projeto-executor">Executor</Label>
          <Input maxLength={200} placeholder="IFRO" {...campo("executor")} {...register("executor")} />
          {erro("executor")}
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
