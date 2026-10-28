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
  FileX,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
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
import { Seletor, type OpcaoSeletor } from "@/components/seletor";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData, mensagemDeErro } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, moeda, numero } from "@/lib/formato";
import { centavosDeTexto, textoDeCentavos } from "@/lib/dinheiro";
import { env } from "@/lib/env";
import { usePapel } from "@/lib/papeis";
import { CATEGORIAS_ITEM, rotuloCategoriaItem } from "@/lib/itens";
import {
  IconeAssinar,
  ModalAssinatura,
  PainelAssinatura,
  type PapelAssinante,
} from "@/components/assinatura";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Entrega = components["schemas"]["Entrega"];
type Associacao = components["schemas"]["Associacao"];
type Item = components["schemas"]["Item"];
type PedidoCompra = components["schemas"]["PedidoCompra"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type Situacao = Entrega["situacao"];

/** Teto do `limit` na API — as listas dos seletores pedem tudo de uma vez. */
const LIMITE_OPCOES = 200;

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "demandado", rotulo: "Demandado" },
  { valor: "aprovado", rotulo: "Aprovado" },
  { valor: "em_compra", rotulo: "Em compra" },
  { valor: "comprado", rotulo: "Comprado" },
  { valor: "entregue", rotulo: "Entregue" },
  { valor: "cancelado", rotulo: "Cancelado" },
];
const rotuloSituacao = (s: Situacao) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacao = (s: Situacao) =>
  s === "entregue" ? "default" : s === "cancelado" ? "destructive" : "secondary";

const reais = (exemplo: string) =>
  z
    .string()
    .transform((v) => centavosDeTexto(v))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), `Valor inválido (ex.: ${exemplo})`);

// Os nomes dos campos são os do body da API: o 400 cai direto no campo certo.
const schema = z
  .object({
    projetoId: z.string().min(1, "Escolha o projeto"),
    associacaoId: z.string().min(1, "Escolha a associação"),
    itemId: z.string().min(1, "Escolha o item"),
    pedidoId: z.string(),
    lote: z.string().trim().max(200, "No máximo 200 caracteres"),
    quantidade: z
      .number({ error: "Informe a quantidade" })
      .int("Use um número inteiro")
      .positive("A quantidade deve ser maior que zero"),
    valorEstimadoCentavos: reais("350.000,00"),
    valorConsolidadoCentavos: reais("342.500,00"),
    situacao: z.enum(["demandado", "aprovado", "em_compra", "comprado", "entregue", "cancelado"]),
    dataPrevista: z.string(),
    dataEntrega: z.string(),
    numeroSerie: z.string().trim().max(200, "No máximo 200 caracteres"),
    observacao: z.string().trim().max(2000, "No máximo 2000 caracteres"),
  })
  .refine((v) => v.situacao !== "entregue" || v.dataEntrega, {
    message: "Informe a data da entrega para marcar como entregue",
    path: ["dataEntrega"],
  })
  .refine((v) => !v.dataEntrega || v.situacao === "entregue", {
    message: "A data da entrega só pode ser informada com a situação entregue",
    path: ["situacao"],
  });
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function EntregasPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar, podeEditarCampo } = usePapel();
  const gestor = podeGerenciar("gestor");
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [lote, setLote] = useQueryState("lote", parseAsString.withDefault(""));
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [situacao, setSituacao] = useQueryState("situacao", parseAsString.withDefault(""));
  const [associacaoId, setAssociacaoId] = useQueryState("associacaoId", parseAsString.withDefault(""));
  const [itemId, setItemId] = useQueryState("itemId", parseAsString.withDefault(""));
  const [categoria, setCategoria] = useQueryState("categoria", parseAsString.withDefault(""));
  const [pedidoId, setPedidoId] = useQueryState("pedidoId", parseAsString.withDefault(""));
  // Sem `sort` na URL vale a ordem da API (as mais recentes primeiro).
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(""));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const { busca: loteDigitado, setBusca: setLoteDigitado } = useBuscaDebounce(lote, setLote, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => (campoOrdenacao ? [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }] : []),
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Entrega | null>(null);
  const [excluir, setExcluir] = useState<Entrega | null>(null);
  const [removerTermo, setRemoverTermo] = useState<Entrega | null>(null);
  const [assinatura, setAssinatura] = useState<Entrega | null>(null);
  // Coleta direto no modal (área grande para a caneta); o Sheet fica para ver a assinatura
  const [colher, setColher] = useState<Entrega | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const alvoTermoRef = useRef<Entrega | null>(null);

  const entregas = useQuery({
    queryKey: [
      "entregas",
      { termo, lote, projetoId, situacao, associacaoId, itemId, categoria, pedidoId, sort, page, limit },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Entrega[], MetaPaginacao>>("/entregas", {
        query: {
          limit,
          offset,
          sort,
          busca: termo,
          lote,
          projetoId,
          situacao,
          associacaoId,
          itemId,
          categoria,
          pedidoId,
        },
        signal,
      }),
  });
  const linhas = entregas.data?.data ?? [];
  const total = entregas.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

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

  const itens = useQuery({
    queryKey: ["itens", { limit: LIMITE_OPCOES, sort: "descricao:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Item[], MetaPaginacao>>("/itens", {
        query: { limit: LIMITE_OPCOES, sort: "descricao:asc" },
        signal,
      }),
  });
  const opcoesItem = useMemo(
    () => (itens.data?.data ?? []).map((i) => ({ value: i.id, label: i.descricao })),
    [itens.data],
  );

  // O chip do pedido vem por link da tela de pedidos (`?pedidoId=`): o número sai do detalhe.
  const pedidoFiltro = useQuery({
    queryKey: ["pedidos-compra", pedidoId],
    queryFn: ({ signal }) => fetchData<Envelope<PedidoCompra>>(`/pedidos-compra/${pedidoId}`, { signal }),
    enabled: !!pedidoId,
  });

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/entregas/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Entrega excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
      queryClient.invalidateQueries({ queryKey: ["pedidos-compra"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a entrega.")),
  });

  const enviarTermo = useMutation({
    mutationFn: ({ id, arquivo }: { id: string; arquivo: File }) => {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      return fetchData(`/entregas/${id}/termo-uso`, { method: "POST", formData });
    },
    onSuccess: () => {
      toast.success("Termo de uso enviado.");
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível enviar o termo de uso.")),
  });

  const removerTermoMutation = useMutation({
    mutationFn: () => fetchData(`/entregas/${removerTermo!.id}/termo-uso`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Termo de uso removido.");
      setRemoverTermo(null);
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível remover o termo de uso.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Entrega>[]>(
    () => [
      {
        accessorKey: "associacaoSigla",
        header: "Associação",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => <span className="font-medium">{row.original.associacaoSigla}</span>,
      },
      {
        accessorKey: "itemDescricao",
        header: "Item",
        enableSorting: false,
        meta: { className: "whitespace-normal" },
        cell: ({ row }) => (
          <div className="flex max-w-56 flex-col">
            <span className="line-clamp-2 break-words">{row.original.itemDescricao}</span>
            <span className="text-xs text-muted-foreground">
              <span className="md:hidden">{row.original.associacaoSigla} · </span>
              {rotuloCategoriaItem(row.original.itemCategoria)} · Qtd. {numero(row.original.quantidade)}
            </span>
            {/* No celular a coluna Situação some: o selo vem aqui */}
            <Badge variant={varianteSituacao(row.original.situacao)} className="mt-1 md:hidden">
              {rotuloSituacao(row.original.situacao)}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "lote",
        header: "Lote",
        enableSorting: false,
        meta: { className: "hidden xl:table-cell" },
        cell: ({ row }) => <span>{row.original.lote ?? "—"}</span>,
      },
      {
        accessorKey: "pedidoNumero",
        header: "Pedido",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => <span className="font-mono">{row.original.pedidoNumero ?? "—"}</span>,
      },
      {
        id: "valor",
        header: "Valor",
        enableSorting: false,
        meta: { className: "hidden text-right md:table-cell" },
        cell: ({ row }) => {
          const consolidado = row.original.valorConsolidadoCentavos;
          return (
            <div className="flex flex-col items-end">
              <span className="tabular-nums">{moeda(consolidado ?? row.original.valorEstimadoCentavos)}</span>
              {consolidado === null && row.original.valorEstimadoCentavos !== null && (
                <span className="text-xs text-muted-foreground">estimado</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "dataPrevista",
        header: "Previsão",
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{dataCalendario(row.original.dataPrevista)}</span>,
      },
      {
        accessorKey: "dataEntrega",
        header: "Entrega",
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{dataCalendario(row.original.dataEntrega)}</span>,
      },
      {
        accessorKey: "situacao",
        header: "Situação",
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (
          <Badge variant={varianteSituacao(row.original.situacao)}>
            {rotuloSituacao(row.original.situacao)}
          </Badge>
        ),
      },
      {
        accessorKey: "temTermoUso",
        header: "Termo de uso",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            {row.original.temTermoUso ? (
              <a
                href={`${env.API_URL}/entregas/${row.original.id}/termo-uso`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                aria-label={`Baixar o termo de uso de ${row.original.itemDescricao} (${row.original.associacaoSigla})`}
              >
                <Download className="size-4" /> Baixar
              </a>
            ) : (
              !row.original.temAssinatura && <span className="text-muted-foreground">—</span>
            )}
            {row.original.temAssinatura && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                aria-label={`Ver a assinatura do termo de uso de ${row.original.itemDescricao} (${row.original.associacaoSigla})`}
                onClick={() => setAssinatura(row.original)}
              >
                <IconeAssinar className="size-4" /> Assinado
              </Button>
            )}
          </div>
        ),
      },
      ...(podeEditarCampo
        ? [
            {
              id: "acoes",
              header: "Ações",
              meta: { className: "w-44 text-right" },
              cell: ({ row }) => {
                const nome = `${row.original.itemDescricao} (${row.original.associacaoSigla})`;
                return (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Editar"
                      aria-label={`Editar a entrega de ${nome}`}
                      onClick={() => setEditar(row.original)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {(row.original.situacao === "entregue" || row.original.temAssinatura) && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={
                          row.original.temAssinatura
                            ? "Assinatura do termo de uso"
                            : "Colher assinatura do termo de uso"
                        }
                        aria-label={`${row.original.temAssinatura ? "Ver a assinatura" : "Colher a assinatura"} do termo de uso de ${nome}`}
                        onClick={() =>
                          row.original.temAssinatura ? setAssinatura(row.original) : setColher(row.original)
                        }
                      >
                        <IconeAssinar className="size-4" />
                      </Button>
                    )}
                    {/* Termo assinado não troca de arquivo (a API recusa): a assinatura vale para ele */}
                    {!row.original.temAssinatura && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={row.original.temTermoUso ? "Substituir termo de uso" : "Enviar termo de uso"}
                        aria-label={`${row.original.temTermoUso ? "Substituir" : "Enviar"} o termo de uso de ${nome}`}
                        onClick={() => {
                          alvoTermoRef.current = row.original;
                          arquivoRef.current?.click();
                        }}
                      >
                        <Upload className="size-4" />
                      </Button>
                    )}
                    {row.original.temTermoUso && !row.original.temAssinatura && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Remover termo de uso"
                        aria-label={`Remover o termo de uso de ${nome}`}
                        onClick={() => setRemoverTermo(row.original)}
                      >
                        <FileX className="size-4" />
                      </Button>
                    )}
                    {gestor && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Excluir"
                        aria-label={`Excluir a entrega de ${nome}`}
                        onClick={() => setExcluir(row.original)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              },
            } satisfies ColumnDef<typeof features, Entrega>,
          ]
        : []),
    ],
    [gestor, podeEditarCampo],
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
        titulo: `Excluir a entrega de “${excluir.itemDescricao}” para ${excluir.associacaoSigla}?`,
        descricao:
          "A entrega some das listagens e dos totais do pedido, mas continua no histórico. Entrega já conferida em visita de acompanhamento não pode ser excluída — cancele-a.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const confirmacaoTermo: Confirmacao | null = removerTermo
    ? {
        titulo: "Remover o termo de uso?",
        descricao: `O arquivo anexado à entrega de “${removerTermo.itemDescricao}” para ${removerTermo.associacaoSigla} deixa de estar disponível.`,
        textoConfirmar: "Remover",
        destrutivo: true,
        pendente: removerTermoMutation.isPending,
        onConfirmar: () => removerTermoMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  const filtrosAtivos =
    termo || lote || projetoId || situacao || associacaoId || itemId || categoria || pedidoId;

  return (
    <PageLayout
      title="Entregas"
      actions={
        podeEditarCampo && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Nova entrega
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por associação ou item…"
          aria-label="Buscar por sigla da associação ou descrição do item"
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
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por categoria do item"
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
        <Seletor
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por item"
          placeholder="Todos os itens"
          vazio="Nenhum item encontrado."
          opcoes={opcoesItem}
          valor={itemId}
          disabled={itens.isPending}
          onValorChange={(valor) => {
            void setItemId(valor);
            void setPage(1);
          }}
        />
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Lote (ex.: 1ª Entrega de 2026)"
          aria-label="Filtrar por lote"
          value={loteDigitado}
          onChange={(e) => setLoteDigitado(e.target.value)}
        />
        {pedidoId && (
          <Badge variant="outline" className="h-9 gap-1.5 pr-1 pl-3 text-sm">
            Pedido {pedidoFiltro.data?.data.numero ?? "…"}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remover o filtro do pedido"
              onClick={() => {
                void setPedidoId(null);
                void setPage(1);
              }}
            >
              <X className="size-3" />
            </Button>
          </Badge>
        )}
        {filtrosAtivos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              setLoteDigitado("");
              void setTermo(null);
              void setLote(null);
              void setProjetoId(null);
              void setSituacao(null);
              void setAssociacaoId(null);
              void setItemId(null);
              void setCategoria(null);
              void setPedidoId(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <input
        ref={arquivoRef}
        type="file"
        accept="application/pdf,image/*"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          const alvo = alvoTermoRef.current;
          e.target.value = "";
          if (arquivo && alvo) enviarTermo.mutate({ id: alvo.id, arquivo });
        }}
      />
      {enviarTermo.isPending && (
        <p role="status" className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Enviando o termo de uso…
        </p>
      )}

      <div className="border" aria-busy={entregas.isPending}>
        <Table aria-label="Lista de entregas" ref={tabelaRef} tabIndex={-1}>
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
            {entregas.isPending ? (
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
            ) : entregas.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(entregas.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as entregas.{" "}
                      <Button variant="link" size="sm" onClick={() => entregas.refetch()}>
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
                    "Nenhuma entrega encontrada"
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

        {(entregas.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {entregas.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} entregas`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} entregas`}
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
            <SheetTitle>Nova entrega</SheetTitle>
            <SheetDescription>
              Destine um item a uma associação participante do projeto e acompanhe da demanda até a entrega.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioEntrega onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar entrega</SheetTitle>
            <SheetDescription>
              {editar && `${editar.itemDescricao} para ${editar.associacaoSigla}.`} Ao marcar como entregue,
              informe a data da entrega.
            </SheetDescription>
          </SheetHeader>
          {editar && <FormularioEntrega key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={assinatura !== null} onOpenChange={(aberto) => !aberto && setAssinatura(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Assinatura do termo de uso</SheetTitle>
            <SheetDescription>
              {assinatura && `${assinatura.itemDescricao} para ${assinatura.associacaoSigla}.`}
            </SheetDescription>
          </SheetHeader>
          {assinatura && (
            <AssinaturaTermo key={assinatura.id} entrega={assinatura} editavel={podeEditarCampo} />
          )}
        </SheetContent>
      </Sheet>

      {colher && (
        <ModalAssinatura
          key={colher.id}
          aberto
          onAbertoChange={(aberto) => !aberto && setColher(null)}
          {...propsAssinaturaTermo(colher)}
        />
      )}

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
      <ConfirmacaoDialog confirmacao={confirmacaoTermo} onFechar={() => setRemoverTermo(null)} />
    </PageLayout>
  );
}

/** Garante que o valor atual aparece no seletor mesmo fora da lista (item inativo, adesão encerrada…). */
function comAtual(opcoes: OpcaoSeletor[], atual: OpcaoSeletor | null): OpcaoSeletor[] {
  if (!atual || opcoes.some((o) => o.value === atual.value)) return opcoes;
  return [atual, ...opcoes];
}

function FormularioEntrega({ registro, onFechar }: { registro?: Entrega; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      projetoId: registro?.projetoId ?? projetos.unico ?? "",
      associacaoId: registro?.associacaoId ?? "",
      itemId: registro?.itemId ?? "",
      pedidoId: registro?.pedidoId ?? "",
      lote: registro?.lote ?? "",
      quantidade: registro?.quantidade ?? 1,
      valorEstimadoCentavos: textoDeCentavos(registro?.valorEstimadoCentavos),
      valorConsolidadoCentavos: textoDeCentavos(registro?.valorConsolidadoCentavos),
      situacao: registro?.situacao ?? "demandado",
      dataPrevista: registro?.dataPrevista ?? "",
      dataEntrega: registro?.dataEntrega ?? "",
      numeroSerie: registro?.numeroSerie ?? "",
      observacao: registro?.observacao ?? "",
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

  const associacoes = useQuery({
    queryKey: ["associacoes", { projetoId, limit: LIMITE_OPCOES, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { projetoId, limit: LIMITE_OPCOES, sort: "sigla:asc" },
        signal,
      }),
    enabled: !!projetoId,
  });
  const opcoesAssociacao = useMemo(
    () =>
      comAtual(
        (associacoes.data?.data ?? []).map((a) => ({
          value: a.id,
          label: `${a.sigla} — ${a.municipioNome}`,
        })),
        registro ? { value: registro.associacaoId, label: registro.associacaoSigla } : null,
      ),
    [associacoes.data, registro],
  );

  const itens = useQuery({
    queryKey: ["itens", { ativo: "true", limit: LIMITE_OPCOES, sort: "descricao:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Item[], MetaPaginacao>>("/itens", {
        query: { ativo: "true", limit: LIMITE_OPCOES, sort: "descricao:asc" },
        signal,
      }),
  });
  const opcoesItem = useMemo(
    () =>
      comAtual(
        (itens.data?.data ?? []).map((i) => ({ value: i.id, label: `${i.descricao} (${i.unidade})` })),
        registro ? { value: registro.itemId, label: registro.itemDescricao } : null,
      ),
    [itens.data, registro],
  );

  const pedidos = useQuery({
    queryKey: ["pedidos-compra", { projetoId, limit: LIMITE_OPCOES, sort: "numero:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<PedidoCompra[], MetaPaginacao>>("/pedidos-compra", {
        query: { projetoId, limit: LIMITE_OPCOES, sort: "numero:asc" },
        signal,
      }),
    enabled: !!projetoId,
  });
  const opcoesPedido = useMemo(
    () =>
      comAtual(
        (pedidos.data?.data ?? []).map((p) => ({
          value: p.id,
          label: [p.numero, p.fornecedor ?? p.descricao].filter(Boolean).join(" — "),
        })),
        registro?.pedidoId && registro.pedidoNumero
          ? { value: registro.pedidoId, label: registro.pedidoNumero }
          : null,
      ),
    [pedidos.data, registro],
  );

  const salvar = useMutation({
    mutationFn: ({ projetoId: projeto, ...d }: FormOutput) => {
      const body = {
        associacaoId: d.associacaoId,
        itemId: d.itemId,
        pedidoId: d.pedidoId || null,
        lote: d.lote || null,
        quantidade: d.quantidade,
        valorEstimadoCentavos: d.valorEstimadoCentavos,
        valorConsolidadoCentavos: d.valorConsolidadoCentavos,
        situacao: d.situacao,
        dataPrevista: d.dataPrevista || null,
        dataEntrega: d.dataEntrega || null,
        numeroSerie: d.numeroSerie || null,
        observacao: d.observacao || null,
      };
      return registro
        ? fetchData(`/entregas/${registro.id}`, { method: "PATCH", body })
        : fetchData("/entregas", { method: "POST", body: { projetoId: projeto, ...body } });
    },
    onSuccess: () => {
      toast.success(registro ? "Entrega atualizada." : "Entrega registrada.");
      queryClient.invalidateQueries({ queryKey: ["entregas"] });
      // Total de entregas e valor consolidado do pedido mudam junto
      queryClient.invalidateQueries({ queryKey: ["pedidos-compra"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a entrega."));
    },
  });

  const campo = (nome: keyof FormValues) => ({
    id: `entrega-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `entrega-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`entrega-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
            <Label htmlFor="entrega-projetoId">Projeto</Label>
            <NativeSelect
              className="w-full"
              disabled={projetos.isPending}
              {...campo("projetoId")}
              {...register("projetoId", {
                // Associação e pedido dependem do projeto: trocar o projeto limpa os dois
                onChange: () => {
                  setValue("associacaoId", "");
                  setValue("pedidoId", "");
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
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="entrega-associacaoId">Associação</Label>
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
                {...campo("associacaoId")}
              />
            )}
          />
          {erro("associacaoId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entrega-itemId">Item</Label>
          <Controller
            control={control}
            name="itemId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={opcoesItem}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder="Buscar item do catálogo…"
                vazio="Nenhum item ativo encontrado."
                disabled={itens.isPending}
                {...campo("itemId")}
              />
            )}
          />
          {erro("itemId")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="entrega-quantidade">Quantidade</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              {...campo("quantidade")}
              {...register("quantidade", { valueAsNumber: true })}
            />
            {erro("quantidade")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entrega-situacao">Situação</Label>
            <NativeSelect className="w-full" {...campo("situacao")} {...register("situacao")}>
              {SITUACOES.map((s) => (
                <NativeSelectOption key={s.valor} value={s.valor}>
                  {s.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {erro("situacao")}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="entrega-dataPrevista">Data prevista</Label>
            <Input type="date" {...campo("dataPrevista")} {...register("dataPrevista")} />
            {erro("dataPrevista")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entrega-dataEntrega">Data da entrega</Label>
            <Input type="date" {...campo("dataEntrega")} {...register("dataEntrega")} />
            {erro("dataEntrega")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entrega-pedidoId">Pedido de compra (opcional)</Label>
          <Controller
            control={control}
            name="pedidoId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={opcoesPedido}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder={projetoId ? "Sem pedido" : "Escolha o projeto primeiro"}
                vazio="Nenhum pedido neste projeto."
                disabled={!projetoId || pedidos.isPending}
                {...campo("pedidoId")}
              />
            )}
          />
          {erro("pedidoId")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entrega-lote">Lote</Label>
          <Input placeholder="1ª Entrega de 2026" maxLength={200} {...campo("lote")} {...register("lote")} />
          {erro("lote")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="entrega-valorEstimadoCentavos">Valor estimado (R$)</Label>
            <Input
              inputMode="decimal"
              placeholder="350.000,00"
              {...campo("valorEstimadoCentavos")}
              {...register("valorEstimadoCentavos")}
            />
            {erro("valorEstimadoCentavos")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="entrega-valorConsolidadoCentavos">Valor consolidado (R$)</Label>
            <Input
              inputMode="decimal"
              placeholder="342.500,00"
              {...campo("valorConsolidadoCentavos")}
              {...register("valorConsolidadoCentavos")}
            />
            {erro("valorConsolidadoCentavos")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entrega-numeroSerie">Nº de série</Label>
          <Input maxLength={200} {...campo("numeroSerie")} {...register("numeroSerie")} />
          {erro("numeroSerie")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="entrega-observacao">Observação</Label>
          <Textarea {...campo("observacao")} {...register("observacao")} />
          {erro("observacao")}
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

/** Assinatura do termo de uso, pela associação (presidente, vice ou outro representante). */
/** O que a coleta da assinatura do termo precisa — o mesmo no Sheet e no modal da linha. */
function propsAssinaturaTermo(entrega: Entrega) {
  return {
    titulo: "Assinatura do termo de uso",
    descricao: `${entrega.itemDescricao} para ${entrega.associacaoSigla}`,
    base: `/entregas/${entrega.id}`,
    queryKey: ["entregas", entrega.id, "assinatura"],
    invalidar: [["entregas"]],
    papeis: ["presidente", "vice_presidente", "outro"] as PapelAssinante[],
    aviso: `Ao assinar, o representante da associação confirma o recebimento de ${entrega.quantidade} × ${entrega.itemDescricao} e o termo de uso.`,
  };
}

function AssinaturaTermo({ entrega, editavel }: { entrega: Entrega; editavel: boolean }) {
  return (
    <PainelAssinatura
      {...propsAssinaturaTermo(entrega)}
      editavel={editavel}
      avisoRemover="O termo de uso volta a poder ser trocado e a entrega a mudar de situação; depois, colha a assinatura de novo. A remoção fica no histórico."
      avisoTravado="Termo assinado: o arquivo não pode ser trocado nem a entrega sair de “Entregue” sem remover a assinatura."
    />
  );
}
