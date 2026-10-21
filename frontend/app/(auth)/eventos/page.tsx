"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { dataHora, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Evento = components["schemas"]["Evento"];
type Associacao = components["schemas"]["Associacao"];
type Municipio = components["schemas"]["Municipio"];
type OpcaoDiagnostico = components["schemas"]["OpcaoDiagnostico"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type TipoEvento = Evento["tipo"];
type SituacaoEvento = Evento["situacao"];

const SORT_PADRAO = "inicio:desc";
const ESTADO_RO = 11;

const TIPOS: { valor: TipoEvento; rotulo: string }[] = [
  { valor: "curso", rotulo: "Curso" },
  { valor: "oficina", rotulo: "Oficina" },
  { valor: "dia_de_campo", rotulo: "Dia de campo" },
  { valor: "palestra", rotulo: "Palestra" },
  { valor: "intercambio", rotulo: "Intercâmbio" },
];
const rotuloTipo = (t: TipoEvento) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;

const SITUACOES: { valor: SituacaoEvento; rotulo: string }[] = [
  { valor: "planejado", rotulo: "Planejado" },
  { valor: "realizado", rotulo: "Realizado" },
  { valor: "cancelado", rotulo: "Cancelado" },
];
const rotuloSituacao = (s: SituacaoEvento) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacao = (s: SituacaoEvento) =>
  s === "realizado" ? "default" : s === "cancelado" ? "destructive" : "secondary";

/** ISO (UTC) → "2026-03-10T08:00" no fuso do navegador — o formato do `datetime-local`. */
function paraDataHoraLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const schema = z
  .object({
    projetoId: z.string().min(1, "Escolha o projeto"),
    titulo: z.string().trim().min(1, "Informe o título").max(300, "No máximo 300 caracteres"),
    tipo: z.enum(["curso", "oficina", "dia_de_campo", "palestra", "intercambio"]),
    temaId: z.string(),
    associacaoId: z.string(),
    municipioId: z.string().min(1, "Escolha o município"),
    local: z.string().trim().max(300, "No máximo 300 caracteres"),
    inicio: z.string().min(1, "Informe o início"),
    fim: z.string().min(1, "Informe o fim"),
    cargaHoraria: z
      .string()
      .trim()
      .transform((v) => (v ? Number(v.replace(",", ".")) : null))
      .refine(
        (v) => v === null || (Number.isFinite(v) && v > 0 && v <= 9999.9),
        "Carga horária inválida (ex.: 8 ou 2,5)",
      ),
    instrutor: z.string().trim().max(200, "No máximo 200 caracteres"),
    situacao: z.enum(["planejado", "realizado", "cancelado"]),
    relato: z.string().trim().max(10_000, "No máximo 10.000 caracteres"),
  })
  .refine((v) => !v.inicio || !v.fim || new Date(v.fim) >= new Date(v.inicio), {
    message: "O fim não pode ser antes do início",
    path: ["fim"],
  });
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function EventosPage() {
  const queryClient = useQueryClient();
  const { podeEditarCampo } = usePapel();
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [tipo, setTipo] = useQueryState("tipo", parseAsString.withDefault(""));
  const [situacao, setSituacao] = useQueryState("situacao", parseAsString.withDefault(""));
  const [associacaoId, setAssociacaoId] = useQueryState("associacaoId", parseAsString.withDefault(""));
  const [municipioId, setMunicipioId] = useQueryState("municipioId", parseAsString.withDefault(""));
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
  const [editar, setEditar] = useState<Evento | null>(null);
  const [excluir, setExcluir] = useState<Evento | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const associacoes = useQuery({
    queryKey: ["associacoes", { projetoId: projetoId || undefined, limit: 200, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { projetoId, limit: 200, sort: "sigla:asc" },
        signal,
      }),
  });
  const opcoesAssociacao = useMemo(
    () =>
      (associacoes.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.sigla} — ${a.municipioNome}` })),
    [associacoes.data],
  );

  const municipios = useQuery({
    queryKey: ["municipios", { estadoId: ESTADO_RO, limit: 200 }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Municipio[], MetaPaginacao>>("/municipios", {
        query: { estadoId: ESTADO_RO, limit: 200 },
        signal,
      }),
  });
  const opcoesMunicipio = useMemo(
    () => (municipios.data?.data ?? []).map((m) => ({ value: String(m.id), label: m.nome })),
    [municipios.data],
  );

  // Data final antes da inicial: o período é ignorado (aviso ao lado dos campos)
  const periodoInvalido = !!de && !!ate && ate < de;
  const eventos = useQuery({
    queryKey: [
      "eventos",
      { termo, projetoId, tipo, situacao, associacaoId, municipioId, de, ate, sort, page, limit },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Evento[], MetaPaginacao>>("/eventos", {
        query: {
          limit,
          offset,
          sort,
          busca: termo,
          projetoId,
          tipo,
          situacao,
          associacaoId,
          municipioId,
          de: periodoInvalido ? undefined : de,
          ate: periodoInvalido ? undefined : ate,
        },
        signal,
      }),
  });
  const linhas = eventos.data?.data ?? [];
  const total = eventos.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/eventos/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Evento excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o evento.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Evento>[]>(
    () => [
      {
        accessorKey: "inicio",
        header: "Data/hora",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap tabular-nums">{dataHora(row.original.inicio)}</span>
        ),
      },
      {
        accessorKey: "titulo",
        header: "Título",
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium wrap-break-word">{row.original.titulo}</span>
            <span className="text-xs text-muted-foreground">
              {rotuloTipo(row.original.tipo)}
              {row.original.temaNome && ` · ${row.original.temaNome}`}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums sm:hidden">
              {dataHora(row.original.inicio)}
            </span>
          </div>
        ),
      },
      {
        id: "local",
        header: "Local",
        enableSorting: false,
        meta: { className: "hidden whitespace-normal md:table-cell" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.associacaoSigla ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{row.original.municipioNome}</span>
          </div>
        ),
      },
      {
        id: "participantes",
        header: "Participantes",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => (
          <span
            className="tabular-nums"
            title={`${row.original.totalPresentes} presentes de ${row.original.totalParticipantes} inscritos`}
          >
            {numero(row.original.totalPresentes)}/{numero(row.original.totalParticipantes)}
          </span>
        ),
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        cell: ({ row }) => (
          <Badge variant={varianteSituacao(row.original.situacao)}>
            {rotuloSituacao(row.original.situacao)}
          </Badge>
        ),
      },
      {
        id: "acoes",
        header: "Ações",
        meta: { className: "w-28 text-right" },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Abrir lista de presença"
              aria-label={`Abrir ${row.original.titulo}`}
              nativeButton={false}
              render={<Link href={`/eventos/${row.original.id}`} />}
            >
              <Eye className="size-4" />
            </Button>
            {podeEditarCampo && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Editar"
                  aria-label={`Editar ${row.original.titulo}`}
                  onClick={() => setEditar(row.original)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Excluir"
                  aria-label={`Excluir ${row.original.titulo}`}
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
    [podeEditarCampo],
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
        titulo: `Excluir o evento “${excluir.titulo}”?`,
        descricao: "O evento e a lista de presença deixam de aparecer e de contar para as metas do projeto.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const temFiltro = termo || projetoId || tipo || situacao || associacaoId || municipioId || de || ate;

  return (
    <PageLayout
      title="Eventos de capacitação"
      breadcrumb="Eventos"
      actions={
        podeEditarCampo && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo evento
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por título…"
          aria-label="Buscar por título"
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
            void setAssociacaoId(null);
            void setPage(1);
          }}
        />
        <NativeSelect
          className="h-9 w-full sm:w-48"
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
          className="h-9 w-full sm:w-48"
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
        <Seletor
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por associação"
          placeholder="Todas as associações"
          vazio="Nenhuma associação encontrada."
          opcoes={opcoesAssociacao}
          valor={associacaoId}
          disabled={associacoes.isPending}
          onValorChange={(valor) => {
            void setAssociacaoId(valor);
            void setPage(1);
          }}
        />
        <Seletor
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por município"
          placeholder="Todos os municípios"
          vazio="Nenhum município encontrado."
          opcoes={opcoesMunicipio}
          valor={municipioId}
          disabled={municipios.isPending}
          onValorChange={(valor) => {
            void setMunicipioId(valor);
            void setPage(1);
          }}
        />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            className="h-9 min-w-0 flex-1 sm:w-40 sm:flex-none"
            aria-label="Início a partir de"
            title="Início a partir de"
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
            aria-label="Início até"
            title="Início até"
            value={ate}
            min={de || undefined}
            aria-invalid={periodoInvalido}
            aria-describedby={periodoInvalido ? "eventos-periodo-erro" : undefined}
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
              void setSituacao(null);
              void setAssociacaoId(null);
              void setMunicipioId(null);
              void setDe(null);
              void setAte(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
        {periodoInvalido && (
          <p id="eventos-periodo-erro" role="alert" className="w-full text-xs text-destructive">
            A data final é anterior à inicial — o período não está sendo aplicado.
          </p>
        )}
      </div>

      <div className="border" aria-busy={eventos.isPending}>
        <Table aria-label="Lista de eventos" ref={tabelaRef} tabIndex={-1}>
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
            {eventos.isPending ? (
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
            ) : eventos.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(eventos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os eventos.{" "}
                      <Button variant="link" size="sm" onClick={() => eventos.refetch()}>
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
                    "Nenhum evento encontrado"
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

        {(eventos.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {eventos.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} eventos`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} eventos`}
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
            <SheetTitle>Novo evento</SheetTitle>
            <SheetDescription>
              Depois de criar, abra o evento para montar a lista de presença.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioEvento
              projetoPadrao={projetoId || projetos.unico}
              onFechar={() => setNovoAberto(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar evento</SheetTitle>
            <SheetDescription>O projeto do evento não muda depois de criado.</SheetDescription>
          </SheetHeader>
          {editar && <FormularioEvento key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioEvento({
  registro,
  projetoPadrao,
  onFechar,
}: {
  registro?: Evento;
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
      titulo: registro?.titulo ?? "",
      tipo: registro?.tipo ?? "oficina",
      temaId: registro?.temaId ?? "",
      associacaoId: registro?.associacaoId ?? "",
      municipioId: registro ? String(registro.municipioId) : "",
      local: registro?.local ?? "",
      inicio: paraDataHoraLocal(registro?.inicio),
      fim: paraDataHoraLocal(registro?.fim),
      cargaHoraria: registro?.cargaHoraria != null ? String(registro.cargaHoraria).replace(".", ",") : "",
      instrutor: registro?.instrutor ?? "",
      situacao: registro?.situacao ?? "planejado",
      relato: registro?.relato ?? "",
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

  const temas = useQuery({
    queryKey: ["opcoes-diagnostico", { grupo: "tema_capacitacao", ativo: true, limit: 200 }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<OpcaoDiagnostico[], MetaPaginacao>>("/opcoes-diagnostico", {
        query: { grupo: "tema_capacitacao", ativo: true, limit: 200 },
        signal,
      }),
  });
  // Tema já gravado mas desativado depois continua na lista — senão salvar o apagaria
  const opcoesTema = useMemo(() => {
    const lista = (temas.data?.data ?? []).map((t) => ({ value: t.id, label: t.nome }));
    if (registro?.temaId && !lista.some((t) => t.value === registro.temaId)) {
      lista.push({ value: registro.temaId, label: registro.temaNome ?? "Tema atual" });
    }
    return lista;
  }, [temas.data, registro]);

  const associacoes = useQuery({
    queryKey: ["associacoes", { projetoId, limit: 200, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { projetoId, limit: 200, sort: "sigla:asc" },
        signal,
      }),
    enabled: !!projetoId,
  });
  const opcoesAssociacao = useMemo(() => {
    const lista = (associacoes.data?.data ?? []).map((a) => ({
      value: a.id,
      label: `${a.sigla} — ${a.municipioNome}`,
    }));
    if (registro?.associacaoId && !lista.some((a) => a.value === registro.associacaoId)) {
      lista.push({ value: registro.associacaoId, label: registro.associacaoSigla ?? "Associação atual" });
    }
    return lista;
  }, [associacoes.data, registro]);

  const municipios = useQuery({
    queryKey: ["municipios", { estadoId: ESTADO_RO, limit: 200 }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Municipio[], MetaPaginacao>>("/municipios", {
        query: { estadoId: ESTADO_RO, limit: 200 },
        signal,
      }),
  });
  const opcoesMunicipio = useMemo(
    () => (municipios.data?.data ?? []).map((m) => ({ value: String(m.id), label: m.nome })),
    [municipios.data],
  );

  const salvar = useMutation({
    mutationFn: ({ projetoId, ...d }: FormOutput) => {
      const body = {
        titulo: d.titulo,
        tipo: d.tipo,
        temaId: d.temaId || null,
        associacaoId: d.associacaoId || null,
        municipioId: Number(d.municipioId),
        local: d.local || null,
        inicio: new Date(d.inicio).toISOString(),
        fim: new Date(d.fim).toISOString(),
        cargaHoraria: d.cargaHoraria,
        instrutor: d.instrutor || null,
        situacao: d.situacao,
        relato: d.relato || null,
      };
      return registro
        ? fetchData(`/eventos/${registro.id}`, { method: "PATCH", body })
        : fetchData("/eventos", { method: "POST", body: { projetoId, ...body } });
    },
    onSuccess: () => {
      toast.success(registro ? "Evento atualizado." : "Evento criado.");
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o evento."));
    },
  });

  const aria = (nome: keyof FormValues) => ({
    id: `evento-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `evento-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`evento-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="evento-projetoId">Projeto</Label>
          <NativeSelect
            className="w-full"
            disabled={!!registro || projetos.isPending}
            {...aria("projetoId")}
            {...register("projetoId", { onChange: () => setValue("associacaoId", "") })}
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

        <div className="grid gap-1.5">
          <Label htmlFor="evento-titulo">Título</Label>
          <Input maxLength={300} {...aria("titulo")} {...register("titulo")} />
          {erro("titulo")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="evento-tipo">Tipo</Label>
            <NativeSelect className="w-full" {...aria("tipo")} {...register("tipo")}>
              {TIPOS.map((t) => (
                <NativeSelectOption key={t.valor} value={t.valor}>
                  {t.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="evento-situacao">Situação</Label>
            <NativeSelect className="w-full" {...aria("situacao")} {...register("situacao")}>
              {SITUACOES.map((s) => (
                <NativeSelectOption key={s.valor} value={s.valor}>
                  {s.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="evento-temaId">Tema</Label>
          <NativeSelect
            className="w-full"
            disabled={temas.isPending}
            {...aria("temaId")}
            {...register("temaId")}
          >
            <NativeSelectOption value="">Sem tema</NativeSelectOption>
            {opcoesTema.map((t) => (
              <NativeSelectOption key={t.value} value={t.value}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {erro("temaId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="evento-associacaoId">Associação anfitriã (opcional)</Label>
          <Controller
            control={control}
            name="associacaoId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={opcoesAssociacao}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder={projetoId ? "Buscar associação…" : "Escolha o projeto primeiro"}
                vazio="Nenhuma associação participa deste projeto."
                disabled={!projetoId || associacoes.isPending}
                {...aria("associacaoId")}
              />
            )}
          />
          {erro("associacaoId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="evento-municipioId">Município</Label>
          <Controller
            control={control}
            name="municipioId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={opcoesMunicipio}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder="Buscar município…"
                vazio="Nenhum município encontrado."
                disabled={municipios.isPending}
                {...aria("municipioId")}
              />
            )}
          />
          {erro("municipioId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="evento-local">Local</Label>
          <Input
            maxLength={300}
            placeholder="Barracão da associação, sítio…"
            {...aria("local")}
            {...register("local")}
          />
          {erro("local")}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="evento-inicio">Início</Label>
            <Input type="datetime-local" {...aria("inicio")} {...register("inicio")} />
            {erro("inicio")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="evento-fim">Fim</Label>
            <Input type="datetime-local" {...aria("fim")} {...register("fim")} />
            {erro("fim")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="evento-cargaHoraria">Carga horária (h)</Label>
            <Input
              inputMode="decimal"
              placeholder="8"
              {...aria("cargaHoraria")}
              {...register("cargaHoraria")}
            />
            {erro("cargaHoraria")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="evento-instrutor">Instrutor(a)</Label>
            <Input maxLength={200} {...aria("instrutor")} {...register("instrutor")} />
            {erro("instrutor")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="evento-relato">Relato</Label>
          <Textarea
            rows={5}
            placeholder="Como foi o evento, conteúdos trabalhados, encaminhamentos…"
            {...aria("relato")}
            {...register("relato")}
          />
          {erro("relato")}
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
