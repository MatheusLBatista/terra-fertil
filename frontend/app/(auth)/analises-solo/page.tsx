"use client";

import { useMemo, useRef, useState } from "react";
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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Unlink,
} from "lucide-react";

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
import { dataCalendario, numero } from "@/lib/formato";
import { env } from "@/lib/env";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type AnaliseSolo = components["schemas"]["AnaliseSolo"];
type Associacao = components["schemas"]["Associacao"];
type Propriedade = components["schemas"]["Propriedade"];
type Visita = components["schemas"]["Visita"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const SORT_PADRAO = "identificadaEm:desc";
/** Teto do `limit` na API — as listas dos seletores pedem tudo de uma vez. */
const LIMITE_OPCOES = 200;

const SITUACOES = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "com_laudo", rotulo: "Com laudo" },
] as const;

const TIPO_VISITA: Record<Visita["tipo"], string> = {
  inicial_associacao: "Visita inicial",
  diagnostico_propriedade: "Diagnóstico da propriedade",
  assistencia_tecnica: "Assistência técnica",
  acompanhamento: "Acompanhamento",
};

/** "Hoje" (YYYY-MM-DD) no fuso das datas do painel — `toISOString()` daria o dia seguinte à noite. */
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: env.TIMEZONE }).format(new Date());

const nomePropriedade = (a: Pick<AnaliseSolo, "propriedadeNome" | "produtorNome">) =>
  a.propriedadeNome ?? `Propriedade de ${a.produtorNome}`;

const linkLaudo = z.httpUrl("Informe um link http(s) válido").max(2000, "No máximo 2000 caracteres");

const schema = z.object({
  projetoId: z.string().min(1, "Escolha o projeto"),
  propriedadeId: z.string().min(1, "Escolha a propriedade"),
  visitaId: z.string(),
  identificadaEm: z.iso.date("Informe a data"),
  observacao: z.string().trim().max(2000, "No máximo 2000 caracteres"),
  laudoUrl: z.union([z.literal(""), linkLaudo]),
});
type FormValues = z.infer<typeof schema>;

const schemaLaudo = z.object({
  laudoUrl: linkLaudo,
  laudoRegistradoEm: z.iso.date("Informe a data do laudo"),
});
type FormLaudo = z.infer<typeof schemaLaudo>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function AnalisesSoloPage() {
  const queryClient = useQueryClient();
  const { podeEditarCampo } = usePapel();
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
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

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<AnaliseSolo | null>(null);
  const [laudo, setLaudo] = useState<AnaliseSolo | null>(null);
  const [removerLaudo, setRemoverLaudo] = useState<AnaliseSolo | null>(null);
  const [excluir, setExcluir] = useState<AnaliseSolo | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const filtros = { busca: termo, projetoId, associacaoId, propriedadeId, de, ate };

  const analises = useQuery({
    queryKey: [
      "analises-solo",
      { termo, projetoId, situacao, associacaoId, propriedadeId, de, ate, sort, page, limit },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<AnaliseSolo[], MetaPaginacao>>("/analises-solo", {
        query: { ...filtros, situacao, limit, offset, sort },
        signal,
      }),
  });
  const linhas = analises.data?.data ?? [];
  const total = analises.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  // Contadores do cabeçalho: só o `meta.total` de uma consulta de 1 registro por situação,
  // com os mesmos filtros da lista (menos a situação).
  const pendentes = useQuery({
    queryKey: [
      "analises-solo",
      { termo, projetoId, associacaoId, propriedadeId, de, ate, situacao: "pendente", limit: 1 },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<AnaliseSolo[], MetaPaginacao>>("/analises-solo", {
        query: { ...filtros, situacao: "pendente", limit: 1 },
        signal,
      }),
  });
  const comLaudo = useQuery({
    queryKey: [
      "analises-solo",
      { termo, projetoId, associacaoId, propriedadeId, de, ate, situacao: "com_laudo", limit: 1 },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<AnaliseSolo[], MetaPaginacao>>("/analises-solo", {
        query: { ...filtros, situacao: "com_laudo", limit: 1 },
        signal,
      }),
  });
  const totalPendentes = pendentes.data?.meta.total;
  const totalComLaudo = comLaudo.data?.meta.total;

  const associacoes = useQuery({
    queryKey: ["associacoes", { projetoId, limit: LIMITE_OPCOES, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { projetoId, limit: LIMITE_OPCOES, sort: "sigla:asc" },
        signal,
      }),
  });
  const opcoesAssociacao = useMemo(
    () =>
      (associacoes.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.sigla} — ${a.municipioNome}` })),
    [associacoes.data],
  );

  const propriedades = useQuery({
    queryKey: ["propriedades", { limit: LIMITE_OPCOES, sort: "nome:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Propriedade[], MetaPaginacao>>("/propriedades", {
        query: { limit: LIMITE_OPCOES, sort: "nome:asc" },
        signal,
      }),
  });
  const opcoesPropriedade = useMemo(
    () =>
      (propriedades.data?.data ?? [])
        .filter((p) => !associacaoId || p.associacaoId === associacaoId)
        .map((p) => ({
          value: p.id,
          label: `${p.nome ?? "Sem nome"} — ${p.produtorNome} (${p.associacaoSigla})`,
        })),
    [propriedades.data, associacaoId],
  );

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/analises-solo/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Análise de solo excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["analises-solo"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a análise de solo.")),
  });

  const removerLaudoMutation = useMutation({
    mutationFn: () =>
      fetchData(`/analises-solo/${removerLaudo!.id}/laudo`, { method: "PUT", body: { laudoUrl: null } }),
    onSuccess: () => {
      toast.success("Link do laudo removido.");
      setRemoverLaudo(null);
      queryClient.invalidateQueries({ queryKey: ["analises-solo"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível remover o link do laudo.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, AnaliseSolo>[]>(
    () => [
      {
        accessorKey: "identificadaEm",
        header: "Identificada em",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => (
          <span className="tabular-nums">{dataCalendario(row.original.identificadaEm)}</span>
        ),
      },
      {
        id: "propriedade",
        header: "Propriedade / produtor",
        enableSorting: false,
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => (
          <div className="flex max-w-56 flex-col gap-0.5">
            <span className="line-clamp-2 font-medium break-words">{nomePropriedade(row.original)}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.produtorNome}
              <span className="sm:hidden"> · {dataCalendario(row.original.identificadaEm)}</span>
            </span>
            {/* No celular a coluna Laudo some: a situação vem aqui */}
            <span className="sm:hidden">
              <Laudo analise={row.original} />
            </span>
          </div>
        ),
      },
      {
        accessorKey: "associacaoSigla",
        header: "Associação",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
      },
      {
        accessorKey: "observacao",
        header: "Observação",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <span
            className="block max-w-xs truncate text-muted-foreground"
            title={row.original.observacao ?? undefined}
          >
            {row.original.observacao ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "laudoRegistradoEm",
        header: "Laudo",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => <Laudo analise={row.original} />,
      },
      ...(podeEditarCampo
        ? [
            {
              id: "acoes",
              header: "Ações",
              meta: { className: "w-36 text-right" },
              cell: ({ row }) => {
                const nome = nomePropriedade(row.original);
                const temLaudo = !!row.original.laudoUrl;
                return (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={temLaudo ? "Alterar link do laudo" : "Registrar link do laudo"}
                      aria-label={`${temLaudo ? "Alterar" : "Registrar"} o link do laudo de ${nome}`}
                      onClick={() => setLaudo(row.original)}
                    >
                      <Link2 className="size-4" />
                    </Button>
                    {temLaudo && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Remover link do laudo"
                        aria-label={`Remover o link do laudo de ${nome}`}
                        onClick={() => setRemoverLaudo(row.original)}
                      >
                        <Unlink className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Editar"
                      aria-label={`Editar a análise de solo de ${nome}`}
                      onClick={() => setEditar(row.original)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Excluir"
                      aria-label={`Excluir a análise de solo de ${nome}`}
                      onClick={() => setExcluir(row.original)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                );
              },
            } satisfies ColumnDef<typeof features, AnaliseSolo>,
          ]
        : []),
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
        titulo: "Excluir esta análise de solo?",
        descricao: `A necessidade de análise de ${nomePropriedade(excluir)} some das listagens, mas continua no histórico.`,
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const confirmacaoLaudo: Confirmacao | null = removerLaudo
    ? {
        titulo: "Remover o link do laudo?",
        descricao: `A análise de ${nomePropriedade(removerLaudo)} volta a ficar pendente. O arquivo no endereço externo não é apagado.`,
        textoConfirmar: "Remover",
        destrutivo: true,
        pendente: removerLaudoMutation.isPending,
        onConfirmar: () => removerLaudoMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const filtrosAtivos = termo || projetoId || situacao || associacaoId || propriedadeId || de || ate;

  return (
    <PageLayout
      title="Análises de solo"
      actions={
        podeEditarCampo && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Nova análise
          </Button>
        )
      }
    >
      <div className="text-sm text-muted-foreground" aria-live="polite">
        {pendentes.isPending || comLaudo.isPending ? (
          <Skeleton className="h-4 w-48" />
        ) : pendentes.isError || comLaudo.isError ? null : (
          <>
            <strong className="font-medium text-foreground">{numero(totalPendentes)}</strong>{" "}
            {totalPendentes === 1 ? "pendente" : "pendentes"} ·{" "}
            <strong className="font-medium text-foreground">{numero(totalComLaudo)}</strong> com laudo
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por propriedade ou produtor…"
          aria-label="Buscar por nome da propriedade ou do produtor"
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
            void setPropriedadeId(null);
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
            void setPropriedadeId(null);
            void setPage(1);
          }}
        />
        <Seletor
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por propriedade"
          placeholder="Todas as propriedades"
          vazio="Nenhuma propriedade encontrada."
          opcoes={opcoesPropriedade}
          valor={propriedadeId}
          disabled={propriedades.isPending}
          onValorChange={(valor) => {
            void setPropriedadeId(valor);
            void setPage(1);
          }}
        />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            className="h-9 flex-1 sm:w-40 sm:flex-none"
            aria-label="Identificada a partir de"
            title="Identificada a partir de"
            value={de}
            max={ate || undefined}
            onChange={(e) => {
              void setDe(e.target.value || null);
              void setPage(1);
            }}
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            className="h-9 flex-1 sm:w-40 sm:flex-none"
            aria-label="Identificada até"
            title="Identificada até"
            value={ate}
            min={de || undefined}
            onChange={(e) => {
              void setAte(e.target.value || null);
              void setPage(1);
            }}
          />
        </div>
        {filtrosAtivos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setProjetoId(null);
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

      <div className="border" aria-busy={analises.isPending}>
        <Table aria-label="Lista de análises de solo" ref={tabelaRef} tabIndex={-1}>
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
            {analises.isPending ? (
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
            ) : analises.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(analises.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as análises de solo.{" "}
                      <Button variant="link" size="sm" onClick={() => analises.refetch()}>
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
                    "Nenhuma análise de solo encontrada"
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

        {(analises.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {analises.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} análises`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} análises`}
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
            <SheetTitle>Nova análise de solo</SheetTitle>
            <SheetDescription>
              Registre a necessidade de análise identificada na propriedade. O link do laudo pode ser
              informado agora ou quando o resultado chegar.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioAnalise onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar análise de solo</SheetTitle>
            <SheetDescription>O link do laudo é registrado pelo botão próprio, na lista.</SheetDescription>
          </SheetHeader>
          {editar && <FormularioAnalise key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={laudo !== null} onOpenChange={(aberto) => !aberto && setLaudo(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Link do laudo</SheetTitle>
            <SheetDescription>
              {laudo && `${nomePropriedade(laudo)} (${laudo.associacaoSigla}). `}
              Cole o endereço onde o laudo está guardado (Drive, site do laboratório…).
            </SheetDescription>
          </SheetHeader>
          {laudo && <FormularioLaudo key={laudo.id} registro={laudo} onFechar={() => setLaudo(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
      <ConfirmacaoDialog confirmacao={confirmacaoLaudo} onFechar={() => setRemoverLaudo(null)} />
    </PageLayout>
  );
}

function Laudo({ analise }: { analise: AnaliseSolo }) {
  if (!analise.laudoUrl) return <Badge variant="secondary">Pendente</Badge>;
  return (
    <span className="inline-flex flex-col">
      <a
        href={analise.laudoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        aria-label={`Abrir o laudo de ${nomePropriedade(analise)} (abre em nova aba)`}
      >
        Abrir laudo <ExternalLink className="size-3.5" />
      </a>
      <span className="text-xs text-muted-foreground tabular-nums">
        {dataCalendario(analise.laudoRegistradoEm)}
      </span>
    </span>
  );
}

function FormularioAnalise({ registro, onFechar }: { registro?: AnaliseSolo; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projetoId: registro?.projetoId ?? projetos.unico ?? "",
      propriedadeId: registro?.propriedadeId ?? "",
      visitaId: registro?.visitaId ?? "",
      identificadaEm: registro?.identificadaEm ?? hoje(),
      observacao: registro?.observacao ?? "",
      laudoUrl: "",
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
  const propriedadeId = useWatch({ control, name: "propriedadeId" });

  const propriedades = useQuery({
    queryKey: ["propriedades", { limit: LIMITE_OPCOES, sort: "nome:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Propriedade[], MetaPaginacao>>("/propriedades", {
        query: { limit: LIMITE_OPCOES, sort: "nome:asc" },
        signal,
      }),
  });
  const opcoesPropriedade = useMemo(() => {
    const opcoes = (propriedades.data?.data ?? []).map((p) => ({
      value: p.id,
      label: `${p.nome ?? "Sem nome"} — ${p.produtorNome} (${p.associacaoSigla})`,
    }));
    if (registro && !opcoes.some((o) => o.value === registro.propriedadeId)) {
      opcoes.unshift({ value: registro.propriedadeId, label: nomePropriedade(registro) });
    }
    return opcoes;
  }, [propriedades.data, registro]);

  const visitas = useQuery({
    queryKey: ["visitas", { projetoId, propriedadeId, limit: LIMITE_OPCOES, sort: "data:desc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Visita[], MetaPaginacao>>("/visitas", {
        query: { projetoId, propriedadeId, limit: LIMITE_OPCOES, sort: "data:desc" },
        signal,
      }),
    enabled: !!projetoId && !!propriedadeId,
  });
  const opcoesVisita = useMemo(
    () =>
      (visitas.data?.data ?? []).map((v) => ({
        value: v.id,
        label: `${dataCalendario(v.data)} — ${TIPO_VISITA[v.tipo]} (${v.tecnicoNome})`,
      })),
    [visitas.data],
  );

  const salvar = useMutation({
    mutationFn: ({ projetoId: projeto, laudoUrl, ...d }: FormValues) => {
      const body = {
        propriedadeId: d.propriedadeId,
        visitaId: d.visitaId || null,
        identificadaEm: d.identificadaEm,
        observacao: d.observacao || null,
      };
      return registro
        ? fetchData(`/analises-solo/${registro.id}`, { method: "PATCH", body })
        : fetchData("/analises-solo", {
            method: "POST",
            body: { projetoId: projeto, ...body, laudoUrl: laudoUrl || null },
          });
    },
    onSuccess: () => {
      toast.success(registro ? "Análise de solo atualizada." : "Análise de solo registrada.");
      queryClient.invalidateQueries({ queryKey: ["analises-solo"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a análise de solo."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `analise-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `analise-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`analise-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
            <Label htmlFor="analise-projetoId">Projeto</Label>
            <NativeSelect
              className="w-full"
              disabled={projetos.isPending}
              {...campo("projetoId")}
              {...register("projetoId", { onChange: () => setValue("visitaId", "") })}
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

        <div className="grid gap-1.5">
          <Label htmlFor="analise-propriedadeId">Propriedade</Label>
          <Controller
            control={control}
            name="propriedadeId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={opcoesPropriedade}
                valor={field.value}
                onValorChange={(v) => {
                  field.onChange(v ?? "");
                  // A visita é da propriedade: trocar a propriedade desfaz a escolha
                  setValue("visitaId", "");
                }}
                placeholder="Buscar propriedade ou produtor…"
                vazio="Nenhuma propriedade encontrada."
                disabled={propriedades.isPending}
                {...campo("propriedadeId")}
              />
            )}
          />
          {erro("propriedadeId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="analise-visitaId">Visita em que foi identificada (opcional)</Label>
          <Controller
            control={control}
            name="visitaId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={opcoesVisita}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder={
                  projetoId && propriedadeId ? "Sem visita" : "Escolha o projeto e a propriedade primeiro"
                }
                vazio="Nenhuma visita a esta propriedade neste projeto."
                disabled={!projetoId || !propriedadeId || visitas.isPending}
                {...campo("visitaId")}
              />
            )}
          />
          {erro("visitaId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="analise-identificadaEm">Identificada em</Label>
          <Input type="date" {...campo("identificadaEm")} {...register("identificadaEm")} />
          {erro("identificadaEm")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="analise-observacao">Observação</Label>
          <Textarea
            placeholder="Área, cultura, motivo da análise…"
            {...campo("observacao")}
            {...register("observacao")}
          />
          {erro("observacao")}
        </div>

        {!registro && (
          <div className="grid gap-1.5">
            <Label htmlFor="analise-laudoUrl">Link do laudo (opcional)</Label>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://…"
              {...campo("laudoUrl")}
              {...register("laudoUrl")}
            />
            {erro("laudoUrl")}
          </div>
        )}
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

function FormularioLaudo({ registro, onFechar }: { registro: AnaliseSolo; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormLaudo>({
    resolver: zodResolver(schemaLaudo),
    defaultValues: {
      laudoUrl: registro.laudoUrl ?? "",
      laudoRegistradoEm: registro.laudoRegistradoEm ?? hoje(),
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (body: FormLaudo) =>
      fetchData(`/analises-solo/${registro.id}/laudo`, { method: "PUT", body }),
    onSuccess: () => {
      toast.success("Link do laudo registrado.");
      queryClient.invalidateQueries({ queryKey: ["analises-solo"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível registrar o link do laudo."));
    },
  });

  const campo = (nome: keyof FormLaudo) => ({
    id: `laudo-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `laudo-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormLaudo) =>
    errors[nome] && (
      <p id={`laudo-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="laudo-laudoUrl">Link do laudo</Label>
          <Input
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/…"
            {...campo("laudoUrl")}
            {...register("laudoUrl")}
          />
          {erro("laudoUrl")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="laudo-laudoRegistradoEm">Data do laudo</Label>
          <Input type="date" {...campo("laudoRegistradoEm")} {...register("laudoRegistradoEm")} />
          {erro("laudoRegistradoEm")}
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
          ) : (
            "Salvar"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
