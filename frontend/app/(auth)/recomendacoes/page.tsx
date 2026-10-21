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
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Trash2 } from "lucide-react";

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
import { Seletor } from "@/components/seletor";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Recomendacao = components["schemas"]["Recomendacao"];
type Propriedade = components["schemas"]["Propriedade"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type Categoria = Recomendacao["categoria"];
type Situacao = Recomendacao["situacao"];

// Mais recentes primeiro (createdAt não tem coluna: é só a ordem padrão)
const SORT_PADRAO = "createdAt:desc";
const LIMITE_OPCOES = 200;

const CATEGORIAS: { valor: Categoria; rotulo: string }[] = [
  { valor: "calagem", rotulo: "Calagem" },
  { valor: "adubacao", rotulo: "Adubação" },
  { valor: "manejo_solo", rotulo: "Manejo do solo" },
  { valor: "manejo_cultura", rotulo: "Manejo da cultura" },
  { valor: "sanidade", rotulo: "Sanidade" },
  { valor: "gestao", rotulo: "Gestão" },
  { valor: "outro", rotulo: "Outro" },
];
const rotuloCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.valor === c)?.rotulo ?? c;

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "adotada", rotulo: "Adotada" },
  { valor: "nao_adotada", rotulo: "Não adotada" },
];
const rotuloSituacao = (s: Situacao) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacao = (s: Situacao) =>
  s === "adotada" ? "default" : s === "nao_adotada" ? "destructive" : "secondary";

const schema = z.object({
  situacao: z.enum(["pendente", "em_andamento", "adotada", "nao_adotada"]),
  prazo: z.union([z.literal(""), z.iso.date("Data inválida")]),
});
type FormValues = z.infer<typeof schema>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function RecomendacoesPage() {
  const queryClient = useQueryClient();
  const { podeEditarCampo } = usePapel();
  const projetos = useProjetos();
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [projetoId, setProjetoId] = useQueryState("projetoId", parseAsString.withDefault(""));
  const [situacao, setSituacao] = useQueryState("situacao", parseAsString.withDefault(""));
  const [categoria, setCategoria] = useQueryState("categoria", parseAsString.withDefault(""));
  const [propriedadeId, setPropriedadeId] = useQueryState("propriedadeId", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [editar, setEditar] = useState<Recomendacao | null>(null);
  const [excluir, setExcluir] = useState<Recomendacao | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  // Mesma consulta (e key) do formulário de visitas
  const propriedades = useQuery({
    queryKey: ["propriedades", { limit: LIMITE_OPCOES }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Propriedade[], MetaPaginacao>>("/propriedades", {
        query: { limit: LIMITE_OPCOES },
        signal,
      }),
  });
  const opcoesPropriedade = useMemo(
    () =>
      (propriedades.data?.data ?? []).map((p) => ({
        value: p.id,
        label: `${p.produtorNome} — ${p.nome ?? "sem nome"} (${p.associacaoSigla})`,
      })),
    [propriedades.data],
  );

  const recomendacoes = useQuery({
    queryKey: ["recomendacoes", { projetoId, situacao, categoria, propriedadeId, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Recomendacao[], MetaPaginacao>>("/recomendacoes", {
        query: { limit, offset, sort, projetoId, situacao, categoria, propriedadeId },
        signal,
      }),
  });
  const linhas = recomendacoes.data?.data ?? [];
  const total = recomendacoes.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;
  const temFiltro = !!(projetoId || situacao || categoria || propriedadeId);

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/recomendacoes/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Recomendação excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["recomendacoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a recomendação.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Recomendacao>[]>(
    () => [
      {
        accessorKey: "descricao",
        header: "Descrição",
        enableSorting: false,
        meta: { className: "max-w-[11rem] sm:max-w-sm" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="line-clamp-2 whitespace-normal">{row.original.descricao}</span>
            {row.original.cultura && (
              <span className="text-xs text-muted-foreground">{row.original.cultura}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "categoria",
        header: "Categoria",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => rotuloCategoria(row.original.categoria),
      },
      {
        accessorKey: "produtorNome",
        header: "Propriedade",
        enableSorting: false,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.produtorNome}</span>
            {row.original.propriedadeNome && (
              <span className="text-xs text-muted-foreground">{row.original.propriedadeNome}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "prazo",
        header: "Prazo",
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{dataCalendario(row.original.prazo)}</span>,
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
        cell: ({ row }) => {
          const r = row.original;
          const nome = r.descricao.slice(0, 60);
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Abrir a visita de origem"
                aria-label={`Abrir a visita de origem: ${nome}`}
                nativeButton={false}
                render={<Link href={`/visitas/${r.visitaId}`} />}
              >
                <Eye className="size-4" />
              </Button>
              {podeEditarCampo && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Editar situação e prazo"
                    aria-label={`Editar situação e prazo: ${nome}`}
                    onClick={() => setEditar(r)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Excluir"
                    aria-label={`Excluir: ${nome}`}
                    onClick={() => setExcluir(r)}
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
        titulo: "Excluir a recomendação?",
        descricao: excluir.descricao,
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout title="Recomendações">
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        <NativeSelect
          className="h-9 w-full sm:w-64"
          aria-label="Filtrar por categoria"
          value={categoria}
          onChange={(e) => {
            void setCategoria(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todas as categorias</NativeSelectOption>
          {CATEGORIAS.map((c) => (
            <NativeSelectOption key={c.valor} value={c.valor}>
              {c.rotulo}
            </NativeSelectOption>
          ))}
        </NativeSelect>
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
        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void setProjetoId(null);
              void setSituacao(null);
              void setCategoria(null);
              void setPropriedadeId(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={recomendacoes.isPending}>
        <Table aria-label="Lista de recomendações" ref={tabelaRef} tabIndex={-1}>
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
            {recomendacoes.isPending ? (
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
            ) : recomendacoes.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(recomendacoes.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as recomendações.{" "}
                      <Button variant="link" size="sm" onClick={() => recomendacoes.refetch()}>
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
                  className="py-6 text-center whitespace-normal text-muted-foreground"
                >
                  {foraDoIntervalo ? (
                    <>
                      Esta página não existe mais.{" "}
                      <Button variant="link" size="sm" onClick={() => setPage(totalPages)}>
                        Ir para a última página
                      </Button>
                    </>
                  ) : (
                    <>
                      Nenhuma recomendação encontrada
                      <span className="mt-1 block text-xs">
                        As recomendações são registradas na visita de assistência técnica: abra a visita em{" "}
                        <Link href="/visitas" className="underline underline-offset-4">
                          Visitas
                        </Link>{" "}
                        para incluir.
                      </span>
                    </>
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

        {(recomendacoes.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {recomendacoes.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} recomendações`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} recomendações`}
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

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Situação da recomendação</SheetTitle>
            <SheetDescription className="line-clamp-3">{editar?.descricao}</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioSituacao key={editar.id} registro={editar} onFechar={() => setEditar(null)} />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioSituacao({ registro, onFechar }: { registro: Recomendacao; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { situacao: registro.situacao, prazo: registro.prazo ?? "" },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (d: FormValues) =>
      fetchData(`/recomendacoes/${registro.id}`, {
        method: "PATCH",
        body: { situacao: d.situacao, prazo: d.prazo || null },
      }),
    onSuccess: () => {
      toast.success("Recomendação atualizada.");
      queryClient.invalidateQueries({ queryKey: ["recomendacoes"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      const status = (erro as Partial<ErroApi>).status;
      if (erros) setErrosApi(erros);
      else if (status === 409 || status === 422)
        setErrosApi([mensagemDeErro(erro, "Não foi possível salvar a recomendação.")]);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a recomendação."));
    },
  });

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

        <dl className="grid gap-2 border bg-muted/30 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Propriedade</dt>
            <dd>
              {registro.produtorNome}
              {registro.propriedadeNome && ` — ${registro.propriedadeNome}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Categoria</dt>
            <dd>
              {rotuloCategoria(registro.categoria)}
              {registro.cultura && ` · ${registro.cultura}`}
            </dd>
          </div>
        </dl>

        <div className="grid gap-1.5">
          <Label htmlFor="recomendacao-situacao">Situação</Label>
          <NativeSelect
            id="recomendacao-situacao"
            className="w-full"
            aria-invalid={!!errors.situacao}
            aria-describedby={errors.situacao ? "recomendacao-situacao-erro" : undefined}
            {...register("situacao")}
          >
            {SITUACOES.map((s) => (
              <NativeSelectOption key={s.valor} value={s.valor}>
                {s.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errors.situacao && (
            <p id="recomendacao-situacao-erro" role="alert" className="text-xs text-destructive">
              {errors.situacao.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="recomendacao-prazo">Prazo</Label>
          <Input
            id="recomendacao-prazo"
            type="date"
            aria-invalid={!!errors.prazo}
            aria-describedby={errors.prazo ? "recomendacao-prazo-erro" : undefined}
            {...register("prazo")}
          />
          {errors.prazo && (
            <p id="recomendacao-prazo-erro" role="alert" className="text-xs text-destructive">
              {errors.prazo.message}
            </p>
          )}
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
