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
  Download,
  ExternalLink,
  FileX,
  Pencil,
  Plus,
  Trash2,
  Upload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type Producao = components["schemas"]["Producao"];
type Meta = components["schemas"]["Meta"];
type Membro = components["schemas"]["MembroEquipe"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type TipoProducao = Producao["tipo"];

const SORT_PADRAO = "titulo:asc";
const TAMANHO_MAXIMO_MB = 20;
const TIPOS_ARQUIVO = "application/pdf,image/jpeg,image/png,image/webp,image/gif";

const TIPOS: { valor: TipoProducao; rotulo: string }[] = [
  { valor: "relatorio_tecnico_participativo", rotulo: "Relatório técnico-participativo" },
  { valor: "relatorio_tecnico", rotulo: "Relatório técnico" },
  { valor: "resumo_cientifico", rotulo: "Resumo científico" },
  { valor: "relatorio_pesquisa", rotulo: "Relatório de pesquisa" },
];
const rotuloTipo = (t: TipoProducao) => TIPOS.find((x) => x.valor === t)?.rotulo ?? t;

const rotuloMeta = (m: Meta) =>
  `Meta ${m.numero} — ${m.descricao.length > 60 ? `${m.descricao.slice(0, 60)}…` : m.descricao}`;

const schema = z.object({
  projetoId: z.string().min(1, "Escolha o projeto"),
  titulo: z.string().trim().min(1, "Informe o título").max(500, "No máximo 500 caracteres"),
  tipo: z.enum([
    "relatorio_tecnico_participativo",
    "relatorio_tecnico",
    "resumo_cientifico",
    "relatorio_pesquisa",
  ]),
  metaId: z.string(),
  concluidaEm: z.string(),
  url: z.union([
    z.literal(""),
    z
      .url({ protocol: /^https?$/, error: "Link inválido (comece com https://)" })
      .max(2000, "Link muito longo"),
  ]),
  resumo: z.string().trim().max(10_000, "No máximo 10.000 caracteres"),
  projetoEquipeIds: z.array(z.string()),
});
type FormValues = z.infer<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function ProducoesPage() {
  const queryClient = useQueryClient();
  const { podeEditarCampo } = usePapel();
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [tipo, setTipo] = useQueryState("tipo", parseAsString.withDefault(""));
  const [metaId, setMetaId] = useQueryState("metaId", parseAsString.withDefault(""));
  const [concluida, setConcluida] = useQueryState("concluida", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Producao | null>(null);
  const [excluir, setExcluir] = useState<Producao | null>(null);
  const [enviarArquivo, setEnviarArquivo] = useState<Producao | null>(null);
  const [removerArquivo, setRemoverArquivo] = useState<Producao | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const metas = useQuery({
    queryKey: ["metas", { projetoId }],
    queryFn: ({ signal }) => fetchData<Envelope<Meta[]>>("/metas", { query: { projetoId }, signal }),
    enabled: !!projetoId,
  });

  const producoes = useQuery({
    queryKey: ["producoes", { termo, projetoId, tipo, metaId, concluida, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Producao[], MetaPaginacao>>("/producoes", {
        query: { limit, offset, sort, busca: termo, projetoId, tipo, metaId, concluida },
        signal,
      }),
  });
  const linhas = producoes.data?.data ?? [];
  const total = producoes.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/producoes/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Produção excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["producoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a produção.")),
  });

  const removerArquivoMutation = useMutation({
    mutationFn: () => fetchData(`/producoes/${removerArquivo!.id}/arquivo`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Arquivo removido.");
      setRemoverArquivo(null);
      queryClient.invalidateQueries({ queryKey: ["producoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível remover o arquivo.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Producao>[]>(() => {
    const base: ColumnDef<typeof features, Producao>[] = [
      {
        accessorKey: "titulo",
        header: "Título",
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium wrap-break-word">{row.original.titulo}</span>
            {row.original.autores.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {row.original.autores.map((a) => a.nome).join(", ")}
              </span>
            )}
            <span className="text-xs text-muted-foreground lg:hidden">{rotuloTipo(row.original.tipo)}</span>
            {(row.original.temArquivo || row.original.url) && (
              <div className="sm:hidden">
                <LinksArquivo producao={row.original} />
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        enableSorting: false,
        meta: { className: "hidden whitespace-normal lg:table-cell" },
        cell: ({ row }) => <span className="text-sm">{rotuloTipo(row.original.tipo)}</span>,
      },
      {
        accessorKey: "metaNumero",
        header: "Meta",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (row.original.metaNumero != null ? `Meta ${row.original.metaNumero}` : "—"),
      },
      {
        accessorKey: "concluidaEm",
        header: "Concluída em",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) =>
          row.original.concluidaEm ? (
            <span className="tabular-nums">{dataCalendario(row.original.concluidaEm)}</span>
          ) : (
            <Badge variant="secondary">Em andamento</Badge>
          ),
      },
      {
        id: "arquivo",
        header: "Arquivo",
        enableSorting: false,
        meta: { className: "hidden w-20 sm:table-cell" },
        cell: ({ row }) =>
          !row.original.temArquivo && !row.original.url ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <LinksArquivo producao={row.original} />
          ),
      },
    ];
    if (!podeEditarCampo) return base;
    return [
      ...base,
      {
        id: "acoes",
        header: "Ações",
        meta: { className: "w-36 text-right" },
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
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
              title={row.original.temArquivo ? "Substituir arquivo" : "Enviar arquivo"}
              aria-label={`${row.original.temArquivo ? "Substituir" : "Enviar"} o arquivo de ${row.original.titulo}`}
              onClick={() => setEnviarArquivo(row.original)}
            >
              <Upload className="size-4" />
            </Button>
            {row.original.temArquivo && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remover arquivo"
                aria-label={`Remover o arquivo de ${row.original.titulo}`}
                onClick={() => setRemoverArquivo(row.original)}
              >
                <FileX className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Excluir"
              aria-label={`Excluir ${row.original.titulo}`}
              onClick={() => setExcluir(row.original)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ];
  }, [podeEditarCampo]);

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

  const confirmacao: Confirmacao | null = excluir
    ? {
        titulo: `Excluir “${excluir.titulo}”?`,
        descricao: "A produção deixa de aparecer e de contar para as metas do projeto.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : removerArquivo
      ? {
          titulo: "Remover o arquivo?",
          descricao: (
            <>
              <strong>{removerArquivo.titulo}</strong> fica sem arquivo anexado. Você pode enviar outro
              depois.
            </>
          ),
          textoConfirmar: "Remover",
          destrutivo: true,
          pendente: removerArquivoMutation.isPending,
          onConfirmar: () => removerArquivoMutation.mutate(),
          focoAposConfirmar: tabelaRef,
        }
      : null;

  const opcoesMeta = metas.data?.data ?? [];

  return (
    <PageLayout
      title="Produções técnicas"
      breadcrumb="Produções"
      actions={
        podeEditarCampo && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Nova produção
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
            void setMetaId(null);
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
          {opcoesMeta.map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {rotuloMeta(m)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          className="h-9 w-full sm:w-48"
          aria-label="Filtrar por conclusão"
          value={concluida}
          onChange={(e) => {
            void setConcluida(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Concluídas ou não</NativeSelectOption>
          <NativeSelectOption value="true">Concluídas</NativeSelectOption>
          <NativeSelectOption value="false">Em andamento</NativeSelectOption>
        </NativeSelect>
        {(termo || projetoId || tipo || metaId || concluida) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setProjetoId(null);
              void setTipo(null);
              void setMetaId(null);
              void setConcluida(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={producoes.isPending}>
        <Table aria-label="Lista de produções" ref={tabelaRef} tabIndex={-1}>
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
            {producoes.isPending ? (
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
            ) : producoes.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(producoes.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as produções.{" "}
                      <Button variant="link" size="sm" onClick={() => producoes.refetch()}>
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
                    "Nenhuma produção encontrada"
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

        {(producoes.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {producoes.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} produções`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} produções`}
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
            <SheetTitle>Nova produção</SheetTitle>
            <SheetDescription>
              Com a data de conclusão preenchida, a produção conta para a meta. O arquivo é enviado depois,
              pela lista.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioProducao
              projetoPadrao={projetoId || projetos.unico}
              onFechar={() => setNovoAberto(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar produção</SheetTitle>
            <SheetDescription>O projeto da produção não muda depois de criada.</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioProducao key={editar.id} registro={editar} onFechar={() => setEditar(null)} />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={enviarArquivo !== null} onOpenChange={(aberto) => !aberto && setEnviarArquivo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{enviarArquivo?.temArquivo ? "Substituir arquivo" : "Enviar arquivo"}</DialogTitle>
            <DialogDescription>
              PDF ou imagem (JPEG, PNG, WebP, GIF), até {TAMANHO_MAXIMO_MB} MB.
              {enviarArquivo?.temArquivo && " O arquivo atual será substituído."}
            </DialogDescription>
          </DialogHeader>
          {enviarArquivo && (
            <FormularioArquivo
              key={enviarArquivo.id}
              producao={enviarArquivo}
              onFechar={() => setEnviarArquivo(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmacaoDialog
        confirmacao={confirmacao}
        onFechar={() => {
          setExcluir(null);
          setRemoverArquivo(null);
        }}
      />
    </PageLayout>
  );
}

/** Baixar o arquivo (proxy autenticado da API — o cookie vai junto) e abrir o link externo. */
function LinksArquivo({ producao }: { producao: Producao }) {
  return (
    <div className="flex gap-1">
      {producao.temArquivo && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Baixar arquivo"
          aria-label={`Baixar o arquivo de ${producao.titulo}`}
          nativeButton={false}
          render={
            <a href={`${env.API_URL}/producoes/${producao.id}/arquivo`} target="_blank" rel="noopener" />
          }
        >
          <Download className="size-4" />
        </Button>
      )}
      {producao.url && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Abrir publicação"
          aria-label={`Abrir a publicação de ${producao.titulo} (nova aba)`}
          nativeButton={false}
          render={<a href={producao.url} target="_blank" rel="noopener noreferrer" />}
        >
          <ExternalLink className="size-4" />
        </Button>
      )}
    </div>
  );
}

function FormularioArquivo({ producao, onFechar }: { producao: Producao; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: (selecionado: File) => {
      const formData = new FormData();
      formData.append("arquivo", selecionado);
      return fetchData(`/producoes/${producao.id}/arquivo`, { method: "POST", formData });
    },
    onSuccess: () => {
      toast.success("Arquivo enviado.");
      queryClient.invalidateQueries({ queryKey: ["producoes"] });
      onFechar();
    },
    onError: (e) => setErro(mensagemDeErro(e, "Não foi possível enviar o arquivo.")),
  });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!arquivo) return setErro("Escolha o arquivo");
        if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
          return setErro(`O arquivo passa de ${TAMANHO_MAXIMO_MB} MB`);
        }
        setErro(null);
        enviar.mutate(arquivo);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="producao-arquivo">Arquivo de “{producao.titulo}”</Label>
        <Input
          id="producao-arquivo"
          type="file"
          accept={TIPOS_ARQUIVO}
          aria-invalid={!!erro}
          aria-describedby={erro ? "producao-arquivo-erro" : undefined}
          onChange={(e) => {
            setArquivo(e.target.files?.[0] ?? null);
            setErro(null);
          }}
        />
        {erro && (
          <p id="producao-arquivo-erro" role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviar.isPending}>
          {enviar.isPending ? (
            <>
              <Spinner /> Enviando…
            </>
          ) : (
            "Enviar"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormularioProducao({
  registro,
  projetoPadrao,
  onFechar,
}: {
  registro?: Producao;
  projetoPadrao?: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const projetos = useProjetos();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projetoId: registro?.projetoId ?? projetoPadrao ?? "",
      titulo: registro?.titulo ?? "",
      tipo: registro?.tipo ?? "relatorio_tecnico",
      metaId: registro?.metaId ?? "",
      concluidaEm: registro?.concluidaEm ?? "",
      url: registro?.url ?? "",
      resumo: registro?.resumo ?? "",
      projetoEquipeIds: registro?.autores.map((a) => a.projetoEquipeId) ?? [],
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

  const equipe = useQuery({
    queryKey: ["projetos", projetoId, "equipe"],
    queryFn: ({ signal }) => fetchData<Envelope<Membro[]>>(`/projetos/${projetoId}/equipe`, { signal }),
    enabled: !!projetoId,
  });
  // Autor que já saiu da equipe continua marcável — senão salvar o tiraria da autoria sem querer
  const autoresPossiveis = useMemo(() => {
    const lista = (equipe.data?.data ?? []).map((m) => ({ id: m.id, nome: m.nome }));
    for (const a of registro?.autores ?? []) {
      if (!lista.some((m) => m.id === a.projetoEquipeId)) lista.push({ id: a.projetoEquipeId, nome: a.nome });
    }
    return lista;
  }, [equipe.data, registro]);

  const salvar = useMutation({
    mutationFn: ({ projetoId, ...d }: FormValues) => {
      const body = {
        titulo: d.titulo,
        tipo: d.tipo,
        metaId: d.metaId || null,
        concluidaEm: d.concluidaEm || null,
        url: d.url || null,
        resumo: d.resumo || null,
        projetoEquipeIds: d.projetoEquipeIds,
      };
      return registro
        ? fetchData(`/producoes/${registro.id}`, { method: "PATCH", body })
        : fetchData("/producoes", { method: "POST", body: { projetoId, ...body } });
    },
    onSuccess: () => {
      toast.success(registro ? "Produção atualizada." : "Produção criada.");
      queryClient.invalidateQueries({ queryKey: ["producoes"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a produção."));
    },
  });

  const aria = (nome: keyof FormValues) => ({
    id: `producao-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `producao-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`producao-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="producao-projetoId">Projeto</Label>
          <NativeSelect
            className="w-full"
            disabled={!!registro || projetos.isPending}
            {...aria("projetoId")}
            {...register("projetoId", {
              onChange: () => {
                setValue("metaId", "");
                setValue("projetoEquipeIds", []);
              },
            })}
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
          <Label htmlFor="producao-titulo">Título</Label>
          <Input maxLength={500} {...aria("titulo")} {...register("titulo")} />
          {erro("titulo")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="producao-tipo">Tipo</Label>
          <NativeSelect className="w-full" {...aria("tipo")} {...register("tipo")}>
            {TIPOS.map((t) => (
              <NativeSelectOption key={t.valor} value={t.valor}>
                {t.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="producao-metaId">Meta (opcional)</Label>
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
          <Label htmlFor="producao-concluidaEm">Concluída em</Label>
          <Input
            type="date"
            aria-describedby={errors.concluidaEm ? "producao-concluidaEm-erro" : "producao-concluidaEm-dica"}
            id="producao-concluidaEm"
            aria-invalid={!!errors.concluidaEm}
            {...register("concluidaEm")}
          />
          {errors.concluidaEm ? (
            erro("concluidaEm")
          ) : (
            <p id="producao-concluidaEm-dica" className="text-xs text-muted-foreground">
              Deixe em branco enquanto estiver em andamento.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="producao-url">Link da publicação (opcional)</Label>
          <Input type="url" inputMode="url" placeholder="https://" {...aria("url")} {...register("url")} />
          {erro("url")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="producao-resumo">Resumo</Label>
          <Textarea rows={4} {...aria("resumo")} {...register("resumo")} />
          {erro("resumo")}
        </div>

        <fieldset
          className="grid gap-2"
          aria-describedby={errors.projetoEquipeIds ? "producao-autores-erro" : undefined}
        >
          <legend className="mb-1 text-sm font-medium">Autores (equipe do projeto)</legend>
          {!projetoId ? (
            <p className="text-xs text-muted-foreground">Escolha o projeto para ver a equipe.</p>
          ) : equipe.isPending ? (
            <Skeleton className="h-4 w-1/2" />
          ) : equipe.isError ? (
            <p className="text-xs text-destructive">Não foi possível carregar a equipe do projeto.</p>
          ) : autoresPossiveis.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguém na equipe deste projeto ainda.</p>
          ) : (
            <Controller
              control={control}
              name="projetoEquipeIds"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {autoresPossiveis.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`producao-autor-${m.id}`}
                        checked={field.value.includes(m.id)}
                        onCheckedChange={(marcado) =>
                          field.onChange(
                            marcado ? [...field.value, m.id] : field.value.filter((id) => id !== m.id),
                          )
                        }
                      />
                      <Label htmlFor={`producao-autor-${m.id}`} className="font-normal">
                        {m.nome}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            />
          )}
          {errors.projetoEquipeIds && (
            <p id="producao-autores-erro" role="alert" className="text-xs text-destructive">
              {errors.projetoEquipeIds.message}
            </p>
          )}
        </fieldset>
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
