"use client";

import { useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { centavosDeTexto, textoDeCentavos } from "@/lib/dinheiro";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Lancamento = components["schemas"]["LancamentoFinanceiro"];
type Meta = components["schemas"]["Meta"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type MetaLancamentos = MetaPaginacao & { totais: { liberadoCentavos: number; despesaCentavos: number } };
type TipoLancamento = Lancamento["tipo"];

const SORT_PADRAO = "data:desc";

const TIPOS: { valor: TipoLancamento; rotulo: string }[] = [
  { valor: "liberacao", rotulo: "Liberação" },
  { valor: "despesa", rotulo: "Despesa" },
];
const rotuloTipo = (t: TipoLancamento) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;

const rotuloMeta = (m: Meta) =>
  `Meta ${m.numero} — ${m.descricao.length > 60 ? `${m.descricao.slice(0, 60)}…` : m.descricao}`;

/** Hoje no fuso do navegador, "YYYY-MM-DD" (en-CA formata assim). */
const hoje = () => new Date().toLocaleDateString("en-CA");

const PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const schema = z.object({
  projetoId: z.string().min(1, "Escolha o projeto"),
  tipo: z.enum(["liberacao", "despesa"]),
  data: z.iso.date("Informe a data"),
  descricao: z.string().trim().min(1, "Informe a descrição").max(500, "No máximo 500 caracteres"),
  valor: z
    .string()
    .transform((v) => centavosDeTexto(v) ?? Number.NaN)
    .refine((v) => Number.isFinite(v) && v > 0, "Informe um valor maior que zero (ex.: 1.234,56)"),
  metaId: z.string(),
  documentoRef: z.string().trim().max(200, "No máximo 200 caracteres"),
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function LancamentosPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const gestor = podeGerenciar("gestor");
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [tipo, setTipo] = useQueryState("tipo", parseAsString.withDefault(""));
  const [metaId, setMetaId] = useQueryState("metaId", parseAsString.withDefault(""));
  const [de, setDe] = useQueryState("de", parseAsString.withDefault(""));
  const [ate, setAte] = useQueryState("ate", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Lancamento | null>(null);
  const [excluir, setExcluir] = useState<Lancamento | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const metas = useQuery({
    queryKey: ["metas", { projetoId }],
    queryFn: ({ signal }) => fetchData<Envelope<Meta[]>>("/metas", { query: { projetoId }, signal }),
    enabled: !!projetoId,
  });

  // A API recusa data final antes da inicial: o período é ignorado (aviso ao lado dos campos)
  const periodoInvalido = !!de && !!ate && ate < de;
  const lancamentos = useQuery({
    queryKey: ["lancamentos", { termo, projetoId, tipo, metaId, de, ate, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Lancamento[], MetaLancamentos>>("/lancamentos", {
        query: {
          limit,
          offset,
          sort,
          busca: termo,
          projetoId,
          tipo,
          metaId,
          de: periodoInvalido ? undefined : de,
          ate: periodoInvalido ? undefined : ate,
        },
        signal,
      }),
  });
  const linhas = lancamentos.data?.data ?? [];
  const total = lancamentos.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;
  const totais = lancamentos.data?.meta.totais;
  const executado =
    totais && totais.liberadoCentavos > 0 ? (totais.despesaCentavos / totais.liberadoCentavos) * 100 : null;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/lancamentos/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Lançamento excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o lançamento.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Lancamento>[]>(() => {
    const base: ColumnDef<typeof features, Lancamento>[] = [
      {
        accessorKey: "data",
        header: "Data",
        meta: { className: "hidden w-28 sm:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{dataCalendario(row.original.data)}</span>,
      },
      {
        accessorKey: "descricao",
        header: "Descrição",
        enableSorting: false,
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="wrap-break-word">{row.original.descricao}</span>
            <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
              {dataCalendario(row.original.data)}
            </span>
            {row.original.documentoRef && (
              <span className="text-xs text-muted-foreground">{row.original.documentoRef}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        enableSorting: false,
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => (
          <Badge variant={row.original.tipo === "liberacao" ? "default" : "secondary"}>
            {rotuloTipo(row.original.tipo)}
          </Badge>
        ),
      },
      {
        accessorKey: "metaNumero",
        header: "Meta",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (row.original.metaNumero != null ? `Meta ${row.original.metaNumero}` : "—"),
      },
      {
        accessorKey: "valorCentavos",
        header: "Valor",
        meta: { className: "text-right" },
        cell: ({ row }) =>
          row.original.tipo === "despesa" ? (
            <span className="whitespace-nowrap text-destructive tabular-nums">
              −{moeda(row.original.valorCentavos)}
            </span>
          ) : (
            <span className="whitespace-nowrap tabular-nums">{moeda(row.original.valorCentavos)}</span>
          ),
      },
    ];
    if (!gestor) return base;
    return [
      ...base,
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
      },
    ];
  }, [gestor]);

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
        titulo: "Excluir o lançamento?",
        descricao: (
          <>
            <strong>{excluir.descricao}</strong> ({rotuloTipo(excluir.tipo).toLowerCase()} de{" "}
            {moeda(excluir.valorCentavos)}) sai dos totais do projeto.
          </>
        ),
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const temFiltro = termo || projetoId || tipo || metaId || de || ate;

  return (
    <PageLayout
      title="Lançamentos financeiros"
      breadcrumb="Lançamentos"
      actions={
        gestor && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo lançamento
          </Button>
        )
      }
    >
      <section aria-label="Totais dos lançamentos filtrados" className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Liberado</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {totais ? moeda(totais.liberadoCentavos) : <Skeleton className="h-7 w-32" />}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Gasto</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {totais ? moeda(totais.despesaCentavos) : <Skeleton className="h-7 w-32" />}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Executado</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {!totais ? (
                <Skeleton className="h-7 w-20" />
              ) : executado === null ? (
                "—"
              ) : (
                `${PERCENTUAL.format(executado)}%`
              )}
            </CardTitle>
          </CardHeader>
          {totais && executado !== null && (
            <CardContent>
              <div className="h-1.5 w-full bg-muted" aria-hidden>
                <div
                  className={executado > 100 ? "h-full bg-destructive" : "h-full bg-primary"}
                  style={{ width: `${Math.min(executado, 100)}%` }}
                />
              </div>
            </CardContent>
          )}
        </Card>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar descrição ou documento…"
          aria-label="Buscar por descrição ou documento"
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
            void setMetaId(null);
            void setPage(1);
          }}
        />
        <NativeSelect
          className="h-9 w-full sm:w-44"
          aria-label="Filtrar por tipo"
          value={tipo}
          onChange={(e) => {
            void setTipo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Liberações e despesas</NativeSelectOption>
          {TIPOS.map((t) => (
            <NativeSelectOption key={t.valor} value={t.valor}>
              {t.rotulo}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por meta"
          title={projetoId ? undefined : "Escolha um projeto para filtrar por meta"}
          value={metaId}
          disabled={!projetoId || metas.isPending}
          onChange={(e) => {
            void setMetaId(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">
            {projetoId ? "Todas as metas" : "Meta (escolha o projeto)"}
          </NativeSelectOption>
          {(metas.data?.data ?? []).map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {rotuloMeta(m)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            className="h-9 min-w-0 flex-1 sm:w-40 sm:flex-none"
            aria-label="Data a partir de"
            title="Data a partir de"
            value={de}
            aria-invalid={periodoInvalido}
            onChange={(e) => {
              void setDe(e.target.value || null);
              void setPage(1);
            }}
          />
          <span className="text-sm text-muted-foreground">a</span>
          <Input
            type="date"
            className="h-9 min-w-0 flex-1 sm:w-40 sm:flex-none"
            aria-label="Data até"
            title="Data até"
            value={ate}
            min={de || undefined}
            aria-invalid={periodoInvalido}
            aria-describedby={periodoInvalido ? "lancamentos-periodo-erro" : undefined}
            onChange={(e) => {
              void setAte(e.target.value || null);
              void setPage(1);
            }}
          />
        </div>
        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setProjetoId(null);
              void setTipo(null);
              void setMetaId(null);
              void setDe(null);
              void setAte(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
        {periodoInvalido && (
          <p id="lancamentos-periodo-erro" role="alert" className="w-full text-xs text-destructive">
            A data final é anterior à inicial — o período não está sendo aplicado.
          </p>
        )}
      </div>

      <div className="border" aria-busy={lancamentos.isPending}>
        <Table aria-label="Lista de lançamentos" ref={tabelaRef} tabIndex={-1}>
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
            {lancamentos.isPending ? (
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
            ) : lancamentos.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(lancamentos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os lançamentos.{" "}
                      <Button variant="link" size="sm" onClick={() => lancamentos.refetch()}>
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
                    "Nenhum lançamento encontrado"
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

        {(lancamentos.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {lancamentos.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} lançamentos`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} lançamentos`}
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
            <SheetTitle>Novo lançamento</SheetTitle>
            <SheetDescription>
              Liberações são os repasses recebidos; despesas, o que foi gasto. O % executado compara os dois.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioLancamento
              projetoPadrao={projetoId || projetos.unico}
              onFechar={() => setNovoAberto(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar lançamento</SheetTitle>
            <SheetDescription>O projeto do lançamento não muda depois de registrado.</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioLancamento key={editar.id} registro={editar} onFechar={() => setEditar(null)} />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioLancamento({
  registro,
  projetoPadrao,
  onFechar,
}: {
  registro?: Lancamento;
  projetoPadrao?: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const projetos = useProjetos();

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      projetoId: registro?.projetoId ?? projetoPadrao ?? "",
      tipo: registro?.tipo ?? "despesa",
      data: registro?.data ?? hoje(),
      descricao: registro?.descricao ?? "",
      valor: textoDeCentavos(registro?.valorCentavos),
      metaId: registro?.metaId ?? "",
      documentoRef: registro?.documentoRef ?? "",
    },
  });
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = form;
  const projetoId = useWatch({ control, name: "projetoId" });

  const metas = useQuery({
    queryKey: ["metas", { projetoId }],
    queryFn: ({ signal }) => fetchData<Envelope<Meta[]>>("/metas", { query: { projetoId }, signal }),
    enabled: !!projetoId,
  });

  const salvar = useMutation({
    mutationFn: ({ projetoId, valor, ...d }: FormOutput) => {
      const body = {
        tipo: d.tipo,
        data: d.data,
        descricao: d.descricao,
        valorCentavos: valor,
        metaId: d.metaId || null,
        documentoRef: d.documentoRef || null,
      };
      return registro
        ? fetchData(`/lancamentos/${registro.id}`, { method: "PATCH", body })
        : fetchData("/lancamentos", { method: "POST", body: { projetoId, ...body } });
    },
    onSuccess: () => {
      toast.success(registro ? "Lançamento atualizado." : "Lançamento registrado.");
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o lançamento."));
    },
  });

  const aria = (nome: keyof FormValues) => ({
    id: `lancamento-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `lancamento-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`lancamento-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message}
      </p>
    );

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((d) => {
        setErrosApi([]);
        salvar.mutate(d);
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
          <Label htmlFor="lancamento-projetoId">Projeto</Label>
          <NativeSelect
            className="w-full"
            disabled={!!registro || projetos.isPending}
            {...aria("projetoId")}
            {...register("projetoId", { onChange: () => setValue("metaId", "") })}
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

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lancamento-tipo">Tipo</Label>
            <NativeSelect className="w-full" {...aria("tipo")} {...register("tipo")}>
              {TIPOS.map((t) => (
                <NativeSelectOption key={t.valor} value={t.valor}>
                  {t.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lancamento-data">Data</Label>
            <Input type="date" {...aria("data")} {...register("data")} />
            {erro("data")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="lancamento-descricao">Descrição</Label>
          <Input
            maxLength={500}
            placeholder="1ª parcela do convênio, compra de calcário…"
            {...aria("descricao")}
            {...register("descricao")}
          />
          {erro("descricao")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="lancamento-valor">Valor (R$)</Label>
          <Input inputMode="decimal" placeholder="1.234,56" {...aria("valor")} {...register("valor")} />
          {erro("valor")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="lancamento-metaId">Meta / rubrica (opcional)</Label>
          <NativeSelect
            className="w-full"
            disabled={!projetoId || metas.isPending}
            {...aria("metaId")}
            {...register("metaId")}
          >
            <NativeSelectOption value="">
              {projetoId ? "Sem meta" : "Escolha o projeto primeiro"}
            </NativeSelectOption>
            {(metas.data?.data ?? []).map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {rotuloMeta(m)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {erro("metaId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="lancamento-documentoRef">Documento (opcional)</Label>
          <Input
            maxLength={200}
            placeholder="NF 123, empenho, ordem bancária…"
            {...aria("documentoRef")}
            {...register("documentoRef")}
          />
          {erro("documentoRef")}
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
            "Registrar"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
