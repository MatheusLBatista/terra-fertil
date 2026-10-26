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
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, Trash2, X } from "lucide-react";

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
import { authClient } from "@/lib/auth-client";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Visita = components["schemas"]["Visita"];
type Membro = components["schemas"]["MembroEquipe"];
type Associacao = components["schemas"]["Associacao"];
type Propriedade = components["schemas"]["Propriedade"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type TipoVisita = Visita["tipo"];
type SituacaoVisita = Visita["situacao"];

const SORT_PADRAO = "data:desc";
/** Teto do `limit` da API — listas dos selects do formulário. */
const LIMITE_OPCOES = 200;

const TIPOS: { valor: TipoVisita; rotulo: string }[] = [
  { valor: "inicial_associacao", rotulo: "Visita inicial na associação" },
  { valor: "diagnostico_propriedade", rotulo: "Diagnóstico na propriedade" },
  { valor: "assistencia_tecnica", rotulo: "Assistência técnica" },
  { valor: "acompanhamento", rotulo: "Acompanhamento" },
];
const rotuloTipo = (t: TipoVisita) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;

const SITUACOES: { valor: SituacaoVisita; rotulo: string }[] = [
  { valor: "agendada", rotulo: "Agendada" },
  { valor: "realizada", rotulo: "Realizada" },
  { valor: "cancelada", rotulo: "Cancelada" },
];
const rotuloSituacao = (s: SituacaoVisita) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacao = (s: SituacaoVisita) =>
  s === "realizada" ? "default" : s === "cancelada" ? "destructive" : "secondary";

/** Onde a visita aconteceu: a associação (inicial ou acompanhamento) ou produtor — propriedade. */
function ondeVisita(v: Visita) {
  if (v.associacaoId) return v.associacaoSigla ?? "—";
  return [v.produtorNome, v.propriedadeNome].filter(Boolean).join(" — ") || "—";
}

/** Data de hoje (fuso do navegador) no formato do `<input type="date">`. */
function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO da API → valor do `<input type="datetime-local">` (hora local do navegador). */
function paraDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const consultaEquipe = (projetoId: string) => ({
  queryKey: ["projetos", projetoId, "equipe"],
  queryFn: ({ signal }: { signal?: AbortSignal }) =>
    fetchData<Envelope<Membro[]>>(`/projetos/${projetoId}/equipe`, { signal }),
});

/** A visita é na associação: a inicial sempre; o acompanhamento quando o local escolhido é ela. */
const naAssociacao = (v: { tipo: TipoVisita; local: "associacao" | "propriedade" }) =>
  v.tipo === "inicial_associacao" || (v.tipo === "acompanhamento" && v.local === "associacao");

const coordenada = (min: number, max: number, rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `${rotulo} inválida`);

const schema = z
  .object({
    projetoId: z.string().min(1, "Escolha o projeto"),
    tipo: z.enum(["inicial_associacao", "diagnostico_propriedade", "assistencia_tecnica", "acompanhamento"]),
    /** Só o acompanhamento escolhe: na associação (confere itens fornecidos) ou na propriedade. */
    local: z.enum(["associacao", "propriedade"]),
    associacaoId: z.string(),
    propriedadeId: z.string(),
    visitaAnteriorId: z.string(),
    data: z.iso.date("Informe a data"),
    situacao: z.enum(["agendada", "realizada", "cancelada"]),
    realizadaEm: z.string(),
    tecnicoId: z.string().min(1, "Escolha o técnico responsável"),
    relato: z.string().trim().max(10_000, "No máximo 10.000 caracteres"),
    latitude: coordenada(-90, 90, "Latitude"),
    longitude: coordenada(-180, 180, "Longitude"),
    noticiaUrl: z
      .string()
      .trim()
      .pipe(
        z.union([
          z.literal(""),
          z.url({ protocol: /^https?$/, error: "Informe um link válido (http:// ou https://)" }),
        ]),
      ),
  })
  .refine((v) => !naAssociacao(v) || v.associacaoId, {
    message: "Escolha a associação",
    path: ["associacaoId"],
  })
  .refine((v) => naAssociacao(v) || v.propriedadeId, {
    message: "Escolha a propriedade",
    path: ["propriedadeId"],
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: "Informe latitude e longitude juntas",
    path: ["latitude"],
  });
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function VisitasPage() {
  const queryClient = useQueryClient();
  const { podeEditarCampo } = usePapel();
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [tipo, setTipo] = useQueryState("tipo", parseAsString.withDefault(""));
  const [situacao, setSituacao] = useQueryState("situacao", parseAsString.withDefault(""));
  const [associacaoId, setAssociacaoId] = useQueryState("associacaoId", parseAsString.withDefault(""));
  const [propriedadeId, setPropriedadeId] = useQueryState("propriedadeId", parseAsString.withDefault(""));
  const [de, setDe] = useQueryState("de", parseAsString.withDefault(""));
  const [ate, setAte] = useQueryState("ate", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novaAberta, setNovaAberta] = useState(false);
  const [editar, setEditar] = useState<Visita | null>(null);
  const [excluir, setExcluir] = useState<Visita | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  // Mesma consulta (e key) da tela de projetos: um registro no cache
  const associacoes = useQuery({
    queryKey: ["associacoes", { limit: LIMITE_OPCOES, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { limit: LIMITE_OPCOES, sort: "sigla:asc" },
        signal,
      }),
  });
  const opcoesAssociacao = useMemo(
    () => (associacoes.data?.data ?? []).map((a) => ({ value: a.id, label: a.sigla })),
    [associacoes.data],
  );

  const propriedadeFiltro = useQuery({
    queryKey: ["propriedades", propriedadeId],
    queryFn: ({ signal }) => fetchData<Envelope<Propriedade>>(`/propriedades/${propriedadeId}`, { signal }),
    enabled: !!propriedadeId,
  });
  const pf = propriedadeFiltro.data?.data;

  const visitas = useQuery({
    queryKey: [
      "visitas",
      { termo, projetoId, tipo, situacao, associacaoId, propriedadeId, de, ate, sort, page, limit },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Visita[], MetaPaginacao>>("/visitas", {
        query: {
          limit,
          offset,
          sort,
          busca: termo,
          projetoId,
          tipo,
          situacao,
          associacaoId,
          propriedadeId,
          de,
          ate,
        },
        signal,
      }),
  });
  const linhas = visitas.data?.data ?? [];
  const total = visitas.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;
  const temFiltro = !!(termo || projetoId || tipo || situacao || associacaoId || propriedadeId || de || ate);

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/visitas/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Visita excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["visitas"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a visita.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Visita>[]>(
    () => [
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="tabular-nums">{dataCalendario(row.original.data)}</span>
            {/* No celular o tipo não tem coluna própria */}
            <span className="max-w-[6.5rem] text-xs whitespace-normal text-muted-foreground md:hidden">
              {rotuloTipo(row.original.tipo)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => rotuloTipo(row.original.tipo),
      },
      {
        id: "onde",
        header: "Onde",
        enableSorting: false,
        cell: ({ row }) => {
          const v = row.original;
          return (
            <div className="flex max-w-[5rem] flex-col sm:max-w-xs">
              <span className="truncate font-medium" title={ondeVisita(v)}>
                {ondeVisita(v)}
              </span>
              {v.propriedadeId && v.associacaoSigla && (
                <span className="truncate text-xs text-muted-foreground">{v.associacaoSigla}</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "tecnicoNome",
        header: "Técnico",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        meta: { className: "hidden sm:table-cell" },
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
        cell: ({ row }) => {
          const v = row.original;
          const nome = `${rotuloTipo(v.tipo).toLowerCase()} de ${dataCalendario(v.data)}`;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Abrir visita"
                aria-label={`Abrir ${nome}`}
                nativeButton={false}
                render={<Link href={`/visitas/${v.id}`} />}
              >
                <Eye className="size-4" />
              </Button>
              {podeEditarCampo && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Editar"
                    aria-label={`Editar ${nome}`}
                    onClick={() => setEditar(v)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Excluir"
                    aria-label={`Excluir ${nome}`}
                    onClick={() => setExcluir(v)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          );
        },
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
        titulo: `Excluir a visita de ${dataCalendario(excluir.data)}?`,
        descricao:
          "Visita com recomendações, análises de solo, acompanhamentos ou diagnóstico ligados não pode ser excluída — nesse caso, marque-a como cancelada.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Visitas"
      actions={
        podeEditarCampo && (
          <Button onClick={() => setNovaAberta(true)}>
            <Plus className="size-4" /> Nova visita
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar associação, propriedade ou produtor…"
          aria-label="Buscar por associação, propriedade ou produtor"
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            className="h-9 min-w-0 flex-1 sm:w-40 sm:flex-none"
            aria-label="Data a partir de"
            title="Data a partir de"
            value={de}
            onChange={(e) => {
              void setDe(e.target.value || null);
              void setPage(1);
            }}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            className="h-9 min-w-0 flex-1 sm:w-40 sm:flex-none"
            aria-label="Data até"
            title="Data até"
            value={ate}
            onChange={(e) => {
              void setAte(e.target.value || null);
              void setPage(1);
            }}
          />
        </div>
        {propriedadeId && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 max-w-full"
            aria-label={`Remover o filtro da propriedade ${pf ? (pf.nome ?? pf.produtorNome) : ""}`}
            onClick={() => {
              void setPropriedadeId(null);
              void setPage(1);
            }}
          >
            <span className="truncate">
              Propriedade:{" "}
              {pf
                ? [pf.produtorNome, pf.nome].filter(Boolean).join(" — ")
                : propriedadeFiltro.isError
                  ? "—"
                  : "…"}
            </span>
            <X data-icon="inline-end" />
          </Button>
        )}
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
              void setPropriedadeId(null);
              void setDe(null);
              void setAte(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={visitas.isPending}>
        <Table aria-label="Lista de visitas" ref={tabelaRef} tabIndex={-1}>
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
            {visitas.isPending ? (
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
            ) : visitas.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(visitas.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as visitas.{" "}
                      <Button variant="link" size="sm" onClick={() => visitas.refetch()}>
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
                    "Nenhuma visita encontrada"
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

        {(visitas.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {visitas.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} visitas`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} visitas`}
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
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Nova visita</SheetTitle>
            <SheetDescription>
              A visita inicial é feita na associação; as demais, na propriedade de um produtor.
            </SheetDescription>
          </SheetHeader>
          {novaAberta && (
            <FormularioVisita
              projetoInicial={projetoId}
              propriedadeInicial={propriedadeId}
              onFechar={() => setNovaAberta(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar visita</SheetTitle>
            <SheetDescription>
              Projeto, tipo e local da visita não mudam depois de registrada.
            </SheetDescription>
          </SheetHeader>
          {editar && <FormularioVisita key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

/**
 * Espera projetos, sessão e (no cadastro) a equipe do projeto inicial antes de
 * montar o formulário: assim os valores padrão — projeto único, técnico = quem
 * está logado, se fizer parte da equipe — saem direto das props, sem efeito.
 */
function FormularioVisita({
  registro,
  projetoInicial,
  propriedadeInicial,
  onFechar,
}: {
  registro?: Visita;
  projetoInicial?: string;
  propriedadeInicial?: string;
  onFechar: () => void;
}) {
  const projetos = useProjetos();
  const sessao = authClient.useSession();
  const projetoPadrao = registro?.projetoId ?? (projetoInicial || projetos.unico || "");
  const buscarEquipe = !registro && !!projetoPadrao;
  const equipe = useQuery({ ...consultaEquipe(projetoPadrao), enabled: buscarEquipe });

  if (projetos.isPending || sessao.isPending || (buscarEquipe && equipe.isPending)) {
    return (
      <div className="grid gap-4 p-4">
        <span role="status" className="sr-only">
          Carregando…
        </span>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }

  const usuarioId = sessao.data?.user.id ?? "";
  const naEquipe = (equipe.data?.data ?? []).some((m) => m.userId === usuarioId);
  const valoresIniciais: FormValues = {
    projetoId: projetoPadrao,
    tipo: registro?.tipo ?? (propriedadeInicial ? "assistencia_tecnica" : "inicial_associacao"),
    local: registro ? (registro.associacaoId ? "associacao" : "propriedade") : "associacao",
    associacaoId: registro?.associacaoId ?? "",
    propriedadeId: registro?.propriedadeId ?? propriedadeInicial ?? "",
    visitaAnteriorId: registro?.visitaAnteriorId ?? "",
    data: registro?.data ?? hoje(),
    situacao: registro?.situacao ?? "agendada",
    realizadaEm: paraDatetimeLocal(registro?.realizadaEm),
    tecnicoId: registro?.tecnicoId ?? (naEquipe ? usuarioId : ""),
    relato: registro?.relato ?? "",
    latitude: registro?.latitude != null ? String(registro.latitude).replace(".", ",") : "",
    longitude: registro?.longitude != null ? String(registro.longitude).replace(".", ",") : "",
    noticiaUrl: registro?.noticiaUrl ?? "",
  };

  return (
    <CamposVisita
      registro={registro}
      valoresIniciais={valoresIniciais}
      usuarioId={usuarioId}
      onFechar={onFechar}
    />
  );
}

function CamposVisita({
  registro,
  valoresIniciais,
  usuarioId,
  onFechar,
}: {
  registro?: Visita;
  valoresIniciais: FormValues;
  usuarioId: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais,
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = form;
  const [projetoId, tipo, local, situacao, propriedadeId] = useWatch({
    control,
    name: ["projetoId", "tipo", "local", "situacao", "propriedadeId"],
  });
  const ehNaAssociacao = naAssociacao({ tipo, local });

  const equipe = useQuery({ ...consultaEquipe(projetoId), enabled: !!projetoId });
  const opcoesTecnico = useMemo(() => {
    const membros = (equipe.data?.data ?? []).map((m) => ({
      value: m.userId,
      label: m.desligadoEm ? `${m.nome} (desligado)` : m.nome,
    }));
    // Técnico atual fora da equipe (ex.: papel que vê todos os projetos) continua escolhível
    if (registro && !membros.some((m) => m.value === registro.tecnicoId)) {
      membros.unshift({ value: registro.tecnicoId, label: registro.tecnicoNome });
    }
    return membros;
  }, [equipe.data, registro]);

  const associacoes = useQuery({
    queryKey: ["associacoes", { projetoId, limit: LIMITE_OPCOES }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { projetoId, limit: LIMITE_OPCOES },
        signal,
      }),
    enabled: !registro && ehNaAssociacao && !!projetoId,
  });
  const opcoesAssociacao = useMemo(
    () =>
      (associacoes.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.sigla} — ${a.municipioNome}` })),
    [associacoes.data],
  );

  const propriedades = useQuery({
    queryKey: ["propriedades", { limit: LIMITE_OPCOES }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Propriedade[], MetaPaginacao>>("/propriedades", {
        query: { limit: LIMITE_OPCOES },
        signal,
      }),
    enabled: !registro && !ehNaAssociacao,
  });
  const opcoesPropriedade = useMemo(
    () =>
      (propriedades.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.produtorNome} — ${p.nome ?? "sem nome"} (${p.associacaoSigla})`,
      })),
    [propriedades.data],
  );

  // Acompanhamento aponta uma assistência técnica ou um diagnóstico na mesma propriedade e projeto
  const buscarAnteriores = tipo === "acompanhamento" && !ehNaAssociacao && !!propriedadeId && !!projetoId;
  const consultaAnteriores = (tipoOrigem: TipoVisita) => ({
    queryKey: ["visitas", { projetoId, propriedadeId, tipo: tipoOrigem, limit: LIMITE_OPCOES }],
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      fetchData<Envelope<Visita[], MetaPaginacao>>("/visitas", {
        query: { projetoId, propriedadeId, tipo: tipoOrigem, limit: LIMITE_OPCOES, sort: "data:desc" },
        signal,
      }),
    enabled: buscarAnteriores,
  });
  const assistencias = useQuery(consultaAnteriores("assistencia_tecnica"));
  const diagnosticos = useQuery(consultaAnteriores("diagnostico_propriedade"));
  const opcoesAnterior = useMemo(
    () =>
      [...(assistencias.data?.data ?? []), ...(diagnosticos.data?.data ?? [])]
        .sort((a, b) => b.data.localeCompare(a.data))
        .map((v) => ({ value: v.id, label: `${dataCalendario(v.data)} — ${rotuloTipo(v.tipo)}` })),
    [assistencias.data, diagnosticos.data],
  );

  const salvar = useMutation({
    mutationFn: (d: FormOutput) => {
      const editaveis = {
        data: d.data,
        situacao: d.situacao,
        realizadaEm:
          d.situacao === "realizada" && d.realizadaEm ? new Date(d.realizadaEm).toISOString() : undefined,
        tecnicoId: d.tecnicoId,
        visitaAnteriorId:
          d.tipo === "acompanhamento" && !naAssociacao(d) ? d.visitaAnteriorId || null : undefined,
        relato: d.relato || null,
        latitude: d.latitude,
        longitude: d.longitude,
        noticiaUrl: d.noticiaUrl || null,
      };
      if (registro) return fetchData(`/visitas/${registro.id}`, { method: "PATCH", body: editaveis });
      return fetchData("/visitas", {
        method: "POST",
        body: {
          projetoId: d.projetoId,
          tipo: d.tipo,
          associacaoId: naAssociacao(d) ? d.associacaoId : undefined,
          propriedadeId: naAssociacao(d) ? undefined : d.propriedadeId,
          ...editaveis,
        },
      });
    },
    onSuccess: () => {
      toast.success(registro ? "Visita atualizada." : "Visita registrada.");
      queryClient.invalidateQueries({ queryKey: ["visitas"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      const status = (erro as Partial<ErroApi>).status;
      if (erros) setErrosApi(erros);
      // Regra de negócio (técnico fora da equipe, associação sem adesão…) fica visível no formulário
      else if (status === 404 || status === 409 || status === 422)
        setErrosApi([mensagemDeErro(erro, "Não foi possível salvar a visita.")]);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a visita."));
    },
  });

  const aria = (nome: keyof FormValues) => ({
    id: `visita-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `visita-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`visita-${nome}-erro`} role="alert" className="text-xs text-destructive">
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

        {registro ? (
          <dl className="grid gap-2 border bg-muted/30 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Projeto</dt>
              <dd>{registro.projetoSigla}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tipo</dt>
              <dd>{rotuloTipo(registro.tipo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Onde</dt>
              <dd>
                {ondeVisita(registro)}
                {registro.propriedadeId && registro.associacaoSigla && ` (${registro.associacaoSigla})`}
              </dd>
            </div>
          </dl>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="visita-projetoId">Projeto</Label>
              <Controller
                control={control}
                name="projetoId"
                render={({ field }) => (
                  <Seletor
                    id="visita-projetoId"
                    className="w-full"
                    opcoes={projetos.opcoes}
                    valor={field.value}
                    placeholder="Escolha o projeto…"
                    vazio="Nenhum projeto encontrado."
                    onValorChange={(v) => {
                      field.onChange(v ?? "");
                      setValue("associacaoId", "");
                      setValue("visitaAnteriorId", "");
                      if (!v) return;
                      // Técnico: mantém o escolhido se estiver na equipe do novo projeto; senão sugere quem está logado
                      void queryClient
                        .fetchQuery(consultaEquipe(v))
                        .then(({ data: membros }) => {
                          const atual = getValues("tecnicoId");
                          if (membros.some((m) => m.userId === atual)) return;
                          setValue("tecnicoId", membros.some((m) => m.userId === usuarioId) ? usuarioId : "");
                        })
                        .catch(() => setValue("tecnicoId", ""));
                    }}
                  />
                )}
              />
              {erro("projetoId")}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="visita-tipo">Tipo</Label>
              <NativeSelect
                className="w-full"
                {...aria("tipo")}
                {...register("tipo", { onChange: () => setValue("visitaAnteriorId", "") })}
              >
                {TIPOS.map((t) => (
                  <NativeSelectOption key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            {tipo === "acompanhamento" && (
              <div className="grid gap-1.5">
                <Label htmlFor="visita-local">Onde</Label>
                <NativeSelect
                  className="w-full"
                  {...aria("local")}
                  aria-describedby="visita-local-dica"
                  {...register("local", { onChange: () => setValue("visitaAnteriorId", "") })}
                >
                  <NativeSelectOption value="associacao">Na associação</NativeSelectOption>
                  <NativeSelectOption value="propriedade">Na propriedade</NativeSelectOption>
                </NativeSelect>
                <p id="visita-local-dica" className="text-xs text-muted-foreground">
                  Na associação, confere os itens fornecidos (com observações e fotos); na propriedade, as
                  recomendações dadas ao produtor.
                </p>
              </div>
            )}

            {ehNaAssociacao ? (
              <div className="grid gap-1.5">
                <Label htmlFor="visita-associacaoId">Associação</Label>
                <Controller
                  control={control}
                  name="associacaoId"
                  render={({ field }) => (
                    <Seletor
                      id="visita-associacaoId"
                      className="w-full"
                      opcoes={opcoesAssociacao}
                      valor={field.value}
                      onValorChange={(v) => field.onChange(v ?? "")}
                      placeholder={projetoId ? "Buscar associação…" : "Escolha o projeto primeiro"}
                      vazio="Nenhuma associação participa deste projeto."
                      disabled={!projetoId || associacoes.isPending}
                    />
                  )}
                />
                {erro("associacaoId")}
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="visita-propriedadeId">Propriedade</Label>
                <Controller
                  control={control}
                  name="propriedadeId"
                  render={({ field }) => (
                    <Seletor
                      id="visita-propriedadeId"
                      className="w-full"
                      opcoes={opcoesPropriedade}
                      valor={field.value}
                      onValorChange={(v) => {
                        field.onChange(v ?? "");
                        setValue("visitaAnteriorId", "");
                      }}
                      placeholder="Buscar produtor ou propriedade…"
                      vazio="Nenhuma propriedade encontrada."
                      disabled={propriedades.isPending}
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">Produtor — propriedade (associação)</p>
                {erro("propriedadeId")}
              </div>
            )}
          </>
        )}

        {tipo === "acompanhamento" && !ehNaAssociacao && (
          <div className="grid gap-1.5">
            <Label htmlFor="visita-visitaAnteriorId">Visita anterior (opcional)</Label>
            <Controller
              control={control}
              name="visitaAnteriorId"
              render={({ field }) => (
                <Seletor
                  id="visita-visitaAnteriorId"
                  className="w-full"
                  opcoes={opcoesAnterior.filter((o) => o.value !== registro?.id)}
                  valor={field.value}
                  onValorChange={(v) => field.onChange(v ?? "")}
                  placeholder={propriedadeId ? "Escolha a visita…" : "Escolha a propriedade primeiro"}
                  vazio="Nenhuma assistência ou diagnóstico nesta propriedade."
                  disabled={!buscarAnteriores || assistencias.isPending || diagnosticos.isPending}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              A assistência técnica ou o diagnóstico que este acompanhamento confere.
            </p>
            {erro("visitaAnteriorId")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="visita-data">Data</Label>
            <Input type="date" {...aria("data")} {...register("data")} />
            {erro("data")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="visita-situacao">Situação</Label>
            <NativeSelect className="w-full" {...aria("situacao")} {...register("situacao")}>
              {SITUACOES.map((s) => (
                <NativeSelectOption key={s.valor} value={s.valor}>
                  {s.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {situacao === "realizada" && (
          <div className="grid gap-1.5">
            <Label htmlFor="visita-realizadaEm">Realizada em</Label>
            <Input
              type="datetime-local"
              {...aria("realizadaEm")}
              aria-describedby={errors.realizadaEm ? "visita-realizadaEm-erro" : "visita-realizadaEm-dica"}
              {...register("realizadaEm")}
            />
            <p id="visita-realizadaEm-dica" className="text-xs text-muted-foreground">
              Em branco, vale o momento em que você salvar.
            </p>
            {erro("realizadaEm")}
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="visita-tecnicoId">Técnico responsável</Label>
          <Controller
            control={control}
            name="tecnicoId"
            render={({ field }) => (
              <Seletor
                id="visita-tecnicoId"
                className="w-full"
                opcoes={opcoesTecnico}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder={projetoId ? "Escolha da equipe do projeto…" : "Escolha o projeto primeiro"}
                vazio="Ninguém na equipe deste projeto."
                disabled={!projetoId || equipe.isPending}
              />
            )}
          />
          {erro("tecnicoId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="visita-relato">Relato</Label>
          <Textarea rows={5} {...aria("relato")} {...register("relato")} />
          {erro("relato")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="visita-latitude">Latitude</Label>
            <Input
              inputMode="decimal"
              placeholder="-12,7406"
              {...aria("latitude")}
              {...register("latitude")}
            />
            {erro("latitude")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="visita-longitude">Longitude</Label>
            <Input
              inputMode="decimal"
              placeholder="-60,1458"
              {...aria("longitude")}
              {...register("longitude")}
            />
            {erro("longitude")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="visita-noticiaUrl">Link da notícia (opcional)</Label>
          <Input type="url" placeholder="https://" {...aria("noticiaUrl")} {...register("noticiaUrl")} />
          {erro("noticiaUrl")}
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
