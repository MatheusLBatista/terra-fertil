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
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";

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
import { Seletor, type OpcaoSeletor } from "@/components/seletor";
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

type Propriedade = components["schemas"]["Propriedade"];
type Produtor = components["schemas"]["Produtor"];
type Associacao = components["schemas"]["Associacao"];
type Municipio = components["schemas"]["Municipio"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const SORT_PADRAO = "produtorNome:asc";
const ESTADO_RO = 11;

const HECTARES = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const hectares = (v: number | null) => (v === null ? "—" : HECTARES.format(v));

/** Número da API → texto com vírgula para o input ("12.5" → "12,5"). */
const textoDeNumero = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

/** Área digitada em pt-BR ("1.234,5") → número; vazio → null. */
const area = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
    if (!Number.isFinite(n) || n < 0 || n > 99_999_999.99) {
      ctx.addIssue({ code: "custom", message: "Área inválida (ex.: 12,5)" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

/** Coordenada em graus decimais, com vírgula ou ponto; vazio → null. */
const coordenada = (limite: number, rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < -limite || n > limite) {
        ctx.addIssue({ code: "custom", message: `${rotulo} entre -${limite} e ${limite}` });
        return z.NEVER;
      }
      return n;
    });

const schemaPropriedade = (edicao: boolean) =>
  z
    .object({
      produtorId: z.string().min(1, "Escolha o produtor"),
      associacaoId: z.string().min(1, "Escolha a associação"),
      nome: z.string().trim().max(200, "No máximo 200 caracteres"),
      municipioId: z.string(),
      distrito: z.string().trim().max(200, "No máximo 200 caracteres"),
      endereco: z.string().trim().max(500, "No máximo 500 caracteres"),
      areaTotalHa: area,
      areaProdutivaHa: area,
      latitude: coordenada(90, "Latitude"),
      longitude: coordenada(180, "Longitude"),
      car: z.string().trim().max(60, "No máximo 60 caracteres"),
      ativo: z.boolean(),
    })
    .refine((v) => !edicao || v.municipioId, { message: "Escolha o município", path: ["municipioId"] })
    .refine(
      (v) => v.areaTotalHa === null || v.areaProdutivaHa === null || v.areaProdutivaHa <= v.areaTotalHa,
      { message: "A área produtiva não pode ser maior que a área total", path: ["areaProdutivaHa"] },
    )
    .refine((v) => v.latitude !== null || v.longitude === null, {
      message: "Informe também a latitude",
      path: ["latitude"],
    })
    .refine((v) => v.longitude !== null || v.latitude === null, {
      message: "Informe também a longitude",
      path: ["longitude"],
    });
type FormValues = z.input<ReturnType<typeof schemaPropriedade>>;
type FormOutput = z.output<ReturnType<typeof schemaPropriedade>>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function PropriedadesPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar, podeEditarCampo } = usePapel();
  const gestor = podeGerenciar("gestor");
  const editavel = podeEditarCampo;
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [produtorId, setProdutorId] = useQueryState("produtorId", parseAsString.withDefault(""));
  const [associacaoId, setAssociacaoId] = useQueryState("associacaoId", parseAsString.withDefault(""));
  const [municipioId, setMunicipioId] = useQueryState("municipioId", parseAsString.withDefault(""));
  const [ativo, setAtivo] = useQueryState("ativo", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Propriedade | null>(null);
  const [excluir, setExcluir] = useState<Propriedade | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const produtores = useQuery({
    queryKey: ["produtores", { limit: 200, sort: "nome:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Produtor[], MetaPaginacao>>("/produtores", {
        query: { limit: 200, sort: "nome:asc" },
        signal,
      }),
  });
  const opcoesProdutor = useMemo(
    () =>
      (produtores.data?.data ?? []).map((p) => ({
        value: p.id,
        label: p.ativo ? p.nome : `${p.nome} (inativo)`,
      })),
    [produtores.data],
  );

  const associacoes = useQuery({
    queryKey: ["associacoes", { limit: 200, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { limit: 200, sort: "sigla:asc" },
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

  const propriedades = useQuery({
    queryKey: ["propriedades", { termo, produtorId, associacaoId, municipioId, ativo, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Propriedade[], MetaPaginacao>>("/propriedades", {
        query: { limit, offset, sort, busca: termo, produtorId, associacaoId, municipioId, ativo },
        signal,
      }),
  });
  const linhas = propriedades.data?.data ?? [];
  const total = propriedades.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  // O produtor do filtro pode vir de um link (/propriedades?produtorId=…) e estar fora dos 200 da lista
  const nomeProdutorFiltro = produtorId
    ? (produtores.data?.data.find((p) => p.id === produtorId)?.nome ??
      linhas.find((l) => l.produtorId === produtorId)?.produtorNome ??
      "selecionado")
    : null;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/propriedades/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Propriedade excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["propriedades"] });
      queryClient.invalidateQueries({ queryKey: ["produtores"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a propriedade.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Propriedade>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Propriedade",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              {row.original.nome ? (
                <span className="font-medium">{row.original.nome}</span>
              ) : (
                <span className="text-muted-foreground italic">Sem nome</span>
              )}
              {!row.original.ativo && <Badge variant="secondary">Inativa</Badge>}
            </span>
            <span className="text-xs text-muted-foreground sm:hidden">{row.original.produtorNome}</span>
          </div>
        ),
      },
      {
        accessorKey: "produtorNome",
        header: "Produtor",
        meta: { className: "hidden sm:table-cell" },
      },
      {
        accessorKey: "associacaoSigla",
        header: "Associação",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
      },
      {
        accessorKey: "municipioNome",
        header: "Município",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
      },
      {
        id: "area",
        header: "Área total / produtiva (ha)",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {hectares(row.original.areaTotalHa)} / {hectares(row.original.areaProdutivaHa)}
          </span>
        ),
      },
      {
        id: "acoes",
        header: "Ações",
        meta: { className: "w-32 text-right" },
        cell: ({ row }) => {
          const rotulo = row.original.nome ?? `propriedade de ${row.original.produtorNome}`;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Visitas"
                aria-label={`Ver as visitas da ${rotulo}`}
                nativeButton={false}
                render={<Link href={`/visitas?propriedadeId=${row.original.id}`} />}
              >
                <ClipboardList className="size-4" />
              </Button>
              {editavel && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Editar"
                  aria-label={`Editar ${rotulo}`}
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
                  aria-label={`Excluir ${rotulo}`}
                  onClick={() => setExcluir(row.original)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [editavel, gestor],
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
        titulo: `Excluir ${excluir.nome ? `a propriedade “${excluir.nome}”` : `a propriedade de ${excluir.produtorNome}`}?`,
        descricao:
          "Só é possível excluir uma propriedade sem visitas nem análises de solo. Se já houver, marque-a como inativa para manter o histórico.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const filtroNaoEncontrado = propriedades.isError && (propriedades.error as Partial<ErroApi>).status === 404;

  return (
    <PageLayout
      title="Propriedades"
      actions={
        editavel && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Nova propriedade
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por propriedade ou produtor…"
          aria-label="Buscar por propriedade ou produtor"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {produtorId ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-9 max-w-full"
            aria-label={`Remover o filtro Produtor: ${nomeProdutorFiltro}`}
            onClick={() => {
              void setProdutorId(null);
              void setPage(1);
            }}
          >
            <span className="truncate">Produtor: {nomeProdutorFiltro}</span>
            <X data-icon="inline-end" />
          </Button>
        ) : (
          <Seletor
            className="h-9 w-full sm:w-64"
            aria-label="Filtrar por produtor"
            placeholder="Todos os produtores"
            vazio="Nenhum produtor encontrado."
            opcoes={opcoesProdutor}
            valor={produtorId}
            disabled={produtores.isPending}
            onValorChange={(valor) => {
              void setProdutorId(valor);
              void setPage(1);
            }}
          />
        )}
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
        <NativeSelect
          className="h-9 w-full sm:w-48"
          aria-label="Filtrar por situação"
          value={ativo}
          onChange={(e) => {
            void setAtivo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todas as situações</NativeSelectOption>
          <NativeSelectOption value="true">Ativas</NativeSelectOption>
          <NativeSelectOption value="false">Inativas</NativeSelectOption>
        </NativeSelect>
        {(termo || produtorId || associacaoId || municipioId || ativo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setProdutorId(null);
              void setAssociacaoId(null);
              void setMunicipioId(null);
              void setAtivo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={propriedades.isPending}>
        <Table aria-label="Lista de propriedades" ref={tabelaRef} tabIndex={-1}>
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
            {propriedades.isPending ? (
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
            ) : propriedades.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(propriedades.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : filtroNaoEncontrado ? (
                    "O produtor ou a associação do filtro não foi encontrado. Limpe os filtros e tente de novo."
                  ) : (
                    <>
                      Erro ao carregar as propriedades.{" "}
                      <Button variant="link" size="sm" onClick={() => propriedades.refetch()}>
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
                    "Nenhuma propriedade encontrada"
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

        {(propriedades.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {propriedades.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} propriedades`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} propriedades`}
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
            <SheetTitle>Nova propriedade</SheetTitle>
            <SheetDescription>
              A propriedade aparece para a equipe dos projetos que atendem a associação escolhida.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioPropriedade
              produtorPadrao={produtorId ? { id: produtorId, nome: nomeProdutorFiltro ?? "" } : undefined}
              opcoesProdutor={opcoesProdutor}
              opcoesAssociacao={opcoesAssociacao}
              opcoesMunicipio={opcoesMunicipio}
              associacoes={associacoes.data?.data ?? []}
              carregando={produtores.isPending || associacoes.isPending || municipios.isPending}
              onFechar={() => setNovoAberto(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar propriedade</SheetTitle>
            <SheetDescription>
              Trocar a associação muda quais equipes de projeto enxergam a propriedade.
            </SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioPropriedade
              key={editar.id}
              registro={editar}
              opcoesProdutor={opcoesProdutor}
              opcoesAssociacao={opcoesAssociacao}
              opcoesMunicipio={opcoesMunicipio}
              associacoes={associacoes.data?.data ?? []}
              carregando={produtores.isPending || associacoes.isPending || municipios.isPending}
              onFechar={() => setEditar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

/** Garante a opção do registro em edição mesmo que ela não esteja na lista carregada. */
const comOpcao = (opcoes: OpcaoSeletor[], extra?: OpcaoSeletor) =>
  extra && extra.value && !opcoes.some((o) => o.value === extra.value) ? [extra, ...opcoes] : opcoes;

function FormularioPropriedade({
  registro,
  produtorPadrao,
  opcoesProdutor,
  opcoesAssociacao,
  opcoesMunicipio,
  associacoes,
  carregando,
  onFechar,
}: {
  registro?: Propriedade;
  produtorPadrao?: { id: string; nome: string };
  opcoesProdutor: OpcaoSeletor[];
  opcoesAssociacao: OpcaoSeletor[];
  opcoesMunicipio: OpcaoSeletor[];
  associacoes: Associacao[];
  carregando: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schemaPropriedade(!!registro)),
    defaultValues: {
      produtorId: registro?.produtorId ?? produtorPadrao?.id ?? "",
      associacaoId: registro?.associacaoId ?? "",
      nome: registro?.nome ?? "",
      municipioId: registro ? String(registro.municipioId) : "",
      distrito: registro?.distrito ?? "",
      endereco: registro?.endereco ?? "",
      areaTotalHa: textoDeNumero(registro?.areaTotalHa),
      areaProdutivaHa: textoDeNumero(registro?.areaProdutivaHa),
      latitude: textoDeNumero(registro?.latitude),
      longitude: textoDeNumero(registro?.longitude),
      car: registro?.car ?? "",
      ativo: registro?.ativo ?? true,
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const associacaoEscolhida = useWatch({ control, name: "associacaoId" });
  const municipioDaAssociacao = associacoes.find((a) => a.id === associacaoEscolhida)?.municipioNome;

  const produtorOpcoes = comOpcao(
    opcoesProdutor,
    registro
      ? { value: registro.produtorId, label: registro.produtorNome }
      : produtorPadrao && { value: produtorPadrao.id, label: produtorPadrao.nome },
  );
  const associacaoOpcoes = comOpcao(
    opcoesAssociacao,
    registro && { value: registro.associacaoId, label: registro.associacaoSigla },
  );
  const municipioOpcoes = comOpcao(
    opcoesMunicipio,
    registro && { value: String(registro.municipioId), label: registro.municipioNome },
  );

  const salvar = useMutation({
    mutationFn: (d: FormOutput) => {
      const body = {
        ...d,
        nome: d.nome || null,
        municipioId: d.municipioId ? Number(d.municipioId) : undefined,
        distrito: d.distrito || null,
        endereco: d.endereco || null,
        car: d.car || null,
      };
      return registro
        ? fetchData(`/propriedades/${registro.id}`, { method: "PATCH", body })
        : fetchData("/propriedades", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(registro ? "Propriedade atualizada." : "Propriedade cadastrada.");
      queryClient.invalidateQueries({ queryKey: ["propriedades"] });
      // A contagem de propriedades da lista de produtores muda
      queryClient.invalidateQueries({ queryKey: ["produtores"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else if ((erro as Partial<ErroApi>).status === 404)
        setErrosApi([
          mensagemDeErro(erro, "Registro não encontrado.") +
            " — confira o produtor, a associação e o município escolhidos.",
        ]);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a propriedade."));
    },
  });

  const aria = (nome: keyof FormValues, dica = false) => ({
    id: `propriedade-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome]
      ? `propriedade-${nome}-erro`
      : dica
        ? `propriedade-${nome}-dica`
        : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`propriedade-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="propriedade-produtorId">Produtor</Label>
          <Controller
            control={control}
            name="produtorId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={produtorOpcoes}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder="Buscar produtor…"
                vazio="Nenhum produtor encontrado."
                disabled={carregando}
                {...aria("produtorId")}
              />
            )}
          />
          {erro("produtorId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="propriedade-associacaoId">Associação</Label>
          <Controller
            control={control}
            name="associacaoId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={associacaoOpcoes}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder="Buscar associação…"
                vazio="Nenhuma associação encontrada."
                disabled={carregando}
                {...aria("associacaoId")}
              />
            )}
          />
          {erro("associacaoId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="propriedade-nome">Nome da propriedade (opcional)</Label>
          <Input maxLength={200} placeholder="Sítio Boa Esperança" {...aria("nome")} {...register("nome")} />
          {erro("nome")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="propriedade-municipioId">Município{registro ? "" : " (opcional)"}</Label>
          <Controller
            control={control}
            name="municipioId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={municipioOpcoes}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder="Buscar município…"
                vazio="Nenhum município encontrado."
                disabled={carregando}
                {...aria("municipioId", !registro)}
              />
            )}
          />
          {erro("municipioId") ??
            (!registro && (
              <p id="propriedade-municipioId-dica" className="text-xs text-muted-foreground">
                Em branco, vale o município da associação
                {municipioDaAssociacao ? ` (${municipioDaAssociacao})` : ""}.
              </p>
            ))}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="propriedade-distrito">Distrito / linha</Label>
          <Input maxLength={200} {...aria("distrito")} {...register("distrito")} />
          {erro("distrito")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="propriedade-endereco">Endereço / referência</Label>
          <Input maxLength={500} {...aria("endereco")} {...register("endereco")} />
          {erro("endereco")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="propriedade-areaTotalHa">Área total (ha)</Label>
            <Input
              inputMode="decimal"
              placeholder="24,5"
              {...aria("areaTotalHa")}
              {...register("areaTotalHa")}
            />
            {erro("areaTotalHa")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="propriedade-areaProdutivaHa">Área produtiva (ha)</Label>
            <Input
              inputMode="decimal"
              placeholder="18"
              {...aria("areaProdutivaHa")}
              {...register("areaProdutivaHa")}
            />
            {erro("areaProdutivaHa")}
          </div>
        </div>

        <fieldset className="grid gap-1.5" aria-describedby="propriedade-coordenadas-dica">
          <legend className="mb-1 text-sm font-medium">Coordenadas (opcional)</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="propriedade-latitude">Latitude</Label>
              <Input
                inputMode="decimal"
                placeholder="-12,7406"
                {...aria("latitude")}
                {...register("latitude")}
              />
              {erro("latitude")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="propriedade-longitude">Longitude</Label>
              <Input
                inputMode="decimal"
                placeholder="-60,1458"
                {...aria("longitude")}
                {...register("longitude")}
              />
              {erro("longitude")}
            </div>
          </div>
          <p id="propriedade-coordenadas-dica" className="text-xs text-muted-foreground">
            Em graus decimais. Informe as duas ou nenhuma.
          </p>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="propriedade-car">CAR (Cadastro Ambiental Rural)</Label>
          <Input maxLength={60} {...aria("car")} {...register("car")} />
          {erro("car")}
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <Checkbox
                id="propriedade-ativo"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v)}
              />
            )}
          />
          <Label htmlFor="propriedade-ativo">Propriedade ativa</Label>
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
            "Cadastrar"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
