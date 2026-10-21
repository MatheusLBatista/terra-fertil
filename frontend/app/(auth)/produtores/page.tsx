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
import { ArrowDown, ArrowUp, ArrowUpDown, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataPagination } from "@/components/ui/data-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Seletor } from "@/components/seletor";
import { SeletorPessoa, type Pessoa } from "@/components/seletor-pessoa";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { numero, telefone } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { PAGE_SIZES } from "@/lib/pageSizes";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Produtor = components["schemas"]["Produtor"];
type Associacao = components["schemas"]["Associacao"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const SORT_PADRAO = "nome:asc";

const somenteDigitos = (v: string) => v.replace(/\D/g, "");

/** Mesma regra do back (`cpfValido` em `lib/documentos.ts`): dígitos verificadores mod 11. */
function cpfValido(valor: string) {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(d.slice(0, 9), 10);
  const d2 = digito(d.slice(0, 9) + d1, 11);
  return d.endsWith(`${d1}${d2}`);
}

/** "52998224725" → "529.982.247-25". */
const formatarCpf = (cpf: string | null) =>
  cpf && cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : (cpf ?? "—");

/** Mesma regra do back (`normalizarTelefone`): DDD + número, com ou sem 55/0 na frente. */
function telefoneNormalizado(valor: string) {
  let d = somenteDigitos(valor);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
}

const cpfSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!cpfValido(v)) {
      ctx.addIssue({ code: "custom", message: "CPF inválido" });
      return z.NEVER;
    }
    return somenteDigitos(v);
  });
const telefoneSchema = z
  .string()
  .trim()
  .refine((v) => !v || telefoneNormalizado(v) !== null, "Telefone inválido (informe DDD + número)");
const emailSchema = z.union([z.literal(""), z.email("E-mail inválido")]);
const observacaoSchema = z.string().trim().max(2000, "No máximo 2000 caracteres");

const schemaNovo = z
  .object({
    modo: z.enum(["existente", "nova"]),
    pessoa: z.custom<Pessoa | null>(),
    nome: z.string().trim().max(200, "No máximo 200 caracteres"),
    email: emailSchema,
    telefone: telefoneSchema,
    cpf: cpfSchema,
    observacao: observacaoSchema,
    ativo: z.boolean(),
  })
  .refine((v) => v.modo === "nova" || v.pessoa, { message: "Escolha a pessoa", path: ["pessoa"] })
  .refine((v) => v.modo === "existente" || v.nome, { message: "Informe o nome", path: ["nome"] });
type FormNovo = z.input<typeof schemaNovo>;
type FormNovoSaida = z.output<typeof schemaNovo>;

const schemaEdicao = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(200, "No máximo 200 caracteres"),
  email: emailSchema,
  telefone: telefoneSchema,
  cpf: cpfSchema,
  observacao: observacaoSchema,
  ativo: z.boolean(),
});
type FormEdicao = z.input<typeof schemaEdicao>;
type FormEdicaoSaida = z.output<typeof schemaEdicao>;

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function ProdutoresPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar, podeEditarCampo } = usePapel();
  const gestor = podeGerenciar("gestor");
  const editavel = podeEditarCampo;
  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("busca", parseAsString.withDefault(""));
  const [associacaoId, setAssociacaoId] = useQueryState("associacaoId", parseAsString.withDefault(""));
  const [ativo, setAtivo] = useQueryState("ativo", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PADRAO));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Produtor | null>(null);
  const [excluir, setExcluir] = useState<Produtor | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

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

  const produtores = useQuery({
    queryKey: ["produtores", { termo, associacaoId, ativo, sort, page, limit }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Produtor[], MetaPaginacao>>("/produtores", {
        query: { limit, offset, sort, busca: termo, associacaoId, ativo },
        signal,
      }),
  });
  const linhas = produtores.data?.data ?? [];
  const total = produtores.data?.meta.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/produtores/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Produtor excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["produtores"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o produtor.")),
  });

  const colunas = useMemo<ColumnDef<typeof features, Produtor>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
      },
      {
        accessorKey: "cpf",
        header: "CPF",
        enableSorting: false,
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => <span className="font-mono text-sm">{formatarCpf(row.original.cpf)}</span>,
      },
      {
        accessorKey: "telefone",
        header: "Telefone",
        enableSorting: false,
        meta: { className: "hidden sm:table-cell" },
        cell: ({ row }) =>
          row.original.telefone ? (
            <a
              href={`https://wa.me/${row.original.telefone}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Conversar no WhatsApp"
              aria-label={`Conversar com ${row.original.nome} no WhatsApp: ${telefone(row.original.telefone)}`}
              className="text-sm tabular-nums underline-offset-4 hover:underline"
            >
              {telefone(row.original.telefone)}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "totalPropriedades",
        header: "Propriedades",
        enableSorting: false,
        meta: { className: "hidden text-right lg:table-cell" },
        cell: ({ row }) => <span className="tabular-nums">{numero(row.original.totalPropriedades)}</span>,
      },
      {
        accessorKey: "ativo",
        header: "Situação",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.ativo ? "default" : "secondary"}>
            {row.original.ativo ? "Ativo" : "Inativo"}
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
              title="Ver propriedades"
              aria-label={`Ver as propriedades de ${row.original.nome}`}
              nativeButton={false}
              render={<Link href={`/propriedades?produtorId=${row.original.id}`} />}
            >
              <MapPinned className="size-4" />
            </Button>
            {editavel && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Editar"
                aria-label={`Editar ${row.original.nome}`}
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
                aria-label={`Excluir ${row.original.nome}`}
                onClick={() => setExcluir(row.original)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
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
        titulo: `Excluir o produtor “${excluir.nome}”?`,
        descricao:
          excluir.totalPropriedades > 0
            ? `${excluir.nome} tem ${numero(excluir.totalPropriedades)} propriedade(s) cadastrada(s): exclua-as antes ou, para deixar de atendê-lo, marque o produtor como inativo.`
            : "Só é possível excluir um produtor sem propriedades. Para deixar de atendê-lo sem perder o histórico, marque-o como inativo.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
      }
    : null;

  return (
    <PageLayout
      title="Produtores"
      actions={
        editavel && (
          <Button onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Novo produtor
          </Button>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por nome, CPF ou telefone…"
          aria-label="Buscar por nome, CPF ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
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
          className="h-9 w-full sm:w-48"
          aria-label="Filtrar por situação"
          value={ativo}
          onChange={(e) => {
            void setAtivo(e.target.value || null);
            void setPage(1);
          }}
        >
          <NativeSelectOption value="">Todas as situações</NativeSelectOption>
          <NativeSelectOption value="true">Ativos</NativeSelectOption>
          <NativeSelectOption value="false">Inativos</NativeSelectOption>
        </NativeSelect>
        {(termo || associacaoId || ativo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setAssociacaoId(null);
              void setAtivo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={produtores.isPending}>
        <Table aria-label="Lista de produtores" ref={tabelaRef} tabIndex={-1}>
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
            {produtores.isPending ? (
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
            ) : produtores.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(produtores.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os produtores.{" "}
                      <Button variant="link" size="sm" onClick={() => produtores.refetch()}>
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
                    "Nenhum produtor encontrado"
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

        {(produtores.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {produtores.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} produtores`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} produtores`}
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
            <SheetTitle>Novo produtor</SheetTitle>
            <SheetDescription>
              Escolha uma pessoa já cadastrada ou cadastre-a agora. Depois, cadastre as propriedades dela.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioNovo
              onFechar={() => setNovoAberto(false)}
              onReativado={(produtor) => {
                setNovoAberto(false);
                setEditar(produtor);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar produtor</SheetTitle>
            <SheetDescription>
              Nome, e-mail e telefone são da pessoa: a mudança vale em todos os cadastros em que ela aparece.
            </SheetDescription>
          </SheetHeader>
          {editar && <FormularioEdicao key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function FormularioNovo({
  onFechar,
  onReativado,
}: {
  onFechar: () => void;
  onReativado: (produtor: Produtor) => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const [excluido, setExcluido] = useState<{ id: string | null; nome: string } | null>(null);
  const form = useForm<FormNovo, unknown, FormNovoSaida>({
    resolver: zodResolver(schemaNovo),
    defaultValues: {
      modo: "existente",
      pessoa: null,
      nome: "",
      email: "",
      telefone: "",
      cpf: "",
      observacao: "",
      ativo: true,
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const modo = useWatch({ control, name: "modo" });

  const salvar = useMutation({
    mutationFn: (d: FormNovoSaida) => {
      const pessoa =
        d.modo === "existente"
          ? { userId: d.pessoa!.id }
          : { pessoa: { nome: d.nome, email: d.email || undefined, telefone: d.telefone || undefined } };
      return fetchData("/produtores", {
        method: "POST",
        body: { ...pessoa, cpf: d.cpf ?? undefined, observacao: d.observacao || undefined, ativo: d.ativo },
      });
    },
    onSuccess: () => {
      toast.success("Produtor cadastrado.");
      queryClient.invalidateQueries({ queryKey: ["produtores"] });
      onFechar();
    },
    onError: (erro, d) => {
      const api = erro as Partial<ErroApi>;
      if (api.status === 409) {
        const codigo = api.meta?.codigo;
        if (codigo === "PRODUTOR_EXCLUIDO") {
          // A API devolve o id do cadastro excluído só dentro da mensagem
          const id = api.message?.match(/produtores\/([0-9a-f-]{36})\/reativar/i)?.[1] ?? null;
          setExcluido({ id, nome: d.modo === "existente" ? d.pessoa!.nome : d.nome });
          return;
        }
        if (codigo === "CPF_DUPLICADO") {
          form.setError(
            "cpf",
            { type: "server", message: "Já existe um produtor com este CPF" },
            { shouldFocus: true },
          );
          return;
        }
        setErrosApi([mensagemDeErro(erro, "Não foi possível cadastrar o produtor.")]);
        return;
      }
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível cadastrar o produtor."));
    },
  });

  const reativar = useMutation({
    mutationFn: (id: string) =>
      fetchData<Envelope<Produtor>>(`/produtores/${id}/reativar`, { method: "POST" }),
    onSuccess: (resposta) => {
      toast.success("Cadastro reativado — confira os dados.");
      queryClient.invalidateQueries({ queryKey: ["produtores"] });
      onReativado(resposta.data);
    },
    onError: (erro) => {
      const status = (erro as Partial<ErroApi>).status;
      setErrosApi([
        status === 404
          ? "Só quem fez o cadastro original ou um gestor pode reativá-lo. Peça a um gestor."
          : mensagemDeErro(erro, "Não foi possível reativar o cadastro."),
      ]);
    },
  });

  const aria = (nome: keyof FormNovo) => ({
    id: `produtor-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `produtor-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormNovo) =>
    errors[nome] && (
      <p id={`produtor-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message as string}
      </p>
    );

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((d) => {
        setErrosApi([]);
        setExcluido(null);
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

        {excluido && (
          <div role="alert" className="grid gap-2 border border-destructive/40 p-3 text-xs">
            <p>
              <strong>{excluido.nome}</strong> já teve um cadastro de produtor, que foi excluído. Reative o
              cadastro antigo em vez de criar outro.
            </p>
            {excluido.id ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={reativar.isPending}
                onClick={() => reativar.mutate(excluido.id!)}
              >
                {reativar.isPending ? (
                  <>
                    <Spinner /> Reativando…
                  </>
                ) : (
                  "Reativar cadastro"
                )}
              </Button>
            ) : (
              <p className="text-muted-foreground">Peça a um gestor para reativá-lo.</p>
            )}
          </div>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Pessoa</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" value="existente" {...register("modo")} /> Já cadastrada
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="nova" {...register("modo")} /> Cadastrar agora
            </label>
          </div>
        </fieldset>

        {modo === "existente" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="produtor-pessoa">Buscar pessoa</Label>
            <Controller
              control={control}
              name="pessoa"
              render={({ field }) => (
                <SeletorPessoa
                  className="w-full"
                  valor={field.value}
                  onValorChange={field.onChange}
                  {...aria("pessoa")}
                />
              )}
            />
            {erro("pessoa")}
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="produtor-nome">Nome</Label>
              <Input maxLength={200} {...aria("nome")} {...register("nome")} />
              {erro("nome")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="produtor-email">E-mail (opcional)</Label>
                <Input type="email" {...aria("email")} {...register("email")} />
                {erro("email")}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="produtor-telefone">Telefone (opcional)</Label>
                <Input
                  inputMode="tel"
                  placeholder="(69) 99999-9999"
                  {...aria("telefone")}
                  {...register("telefone")}
                />
                {erro("telefone")}
              </div>
            </div>
          </>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="produtor-cpf">CPF (opcional)</Label>
          <Input inputMode="numeric" placeholder="000.000.000-00" {...aria("cpf")} {...register("cpf")} />
          {erro("cpf")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="produtor-observacao">Observação</Label>
          <Textarea maxLength={2000} {...aria("observacao")} {...register("observacao")} />
          {erro("observacao")}
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <Checkbox
                id="produtor-ativo"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v)}
              />
            )}
          />
          <Label htmlFor="produtor-ativo">Produtor ativo</Label>
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
            "Cadastrar"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

function FormularioEdicao({ registro, onFechar }: { registro: Produtor; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormEdicao, unknown, FormEdicaoSaida>({
    resolver: zodResolver(schemaEdicao),
    defaultValues: {
      nome: registro.nome,
      email: registro.email ?? "",
      telefone: registro.telefone ? telefone(registro.telefone) : "",
      cpf: registro.cpf ? formatarCpf(registro.cpf) : "",
      observacao: registro.observacao ?? "",
      ativo: registro.ativo,
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (d: FormEdicaoSaida) => {
      // Só manda os dados da pessoa que mudaram: quem também usa o painel (técnico,
      // gestor…) tem nome/e-mail/telefone geridos em Usuários e a API recusaria
      const body: Record<string, unknown> = {
        cpf: d.cpf,
        observacao: d.observacao || null,
        ativo: d.ativo,
      };
      if (d.nome !== registro.nome) body.nome = d.nome;
      if ((d.email || null) !== registro.email) body.email = d.email || null;
      const tel = d.telefone ? telefoneNormalizado(d.telefone) : null;
      if (tel !== registro.telefone) body.telefone = d.telefone || null;
      return fetchData(`/produtores/${registro.id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      toast.success("Produtor atualizado.");
      queryClient.invalidateQueries({ queryKey: ["produtores"] });
      onFechar();
    },
    onError: (erro) => {
      const api = erro as Partial<ErroApi>;
      if (api.status === 409) {
        const codigo = api.meta?.codigo;
        if (codigo === "PESSOA_COM_OUTRO_PAPEL") {
          setErrosApi([
            `${registro.nome} também acessa o painel, então nome, e-mail e telefone dessa pessoa só podem ser alterados em Usuários. Desfaça a mudança nesses campos para salvar o restante.`,
          ]);
          return;
        }
        if (codigo === "CPF_DUPLICADO") {
          form.setError(
            "cpf",
            { type: "server", message: "Já existe um produtor com este CPF" },
            { shouldFocus: true },
          );
          return;
        }
        if (codigo === "PESSOA_DUPLICADA") {
          const campo = api.message?.includes("e-mail") ? "email" : "telefone";
          form.setError(
            campo,
            { type: "server", message: api.message ?? "Já cadastrado" },
            { shouldFocus: true },
          );
          return;
        }
        setErrosApi([mensagemDeErro(erro, "Não foi possível salvar o produtor.")]);
        return;
      }
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o produtor."));
    },
  });

  const aria = (nome: keyof FormEdicao) => ({
    id: `produtor-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `produtor-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormEdicao) =>
    errors[nome] && (
      <p id={`produtor-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
          <Label htmlFor="produtor-nome">Nome</Label>
          <Input maxLength={200} {...aria("nome")} {...register("nome")} />
          {erro("nome")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="produtor-email">E-mail</Label>
            <Input type="email" {...aria("email")} {...register("email")} />
            {erro("email")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="produtor-telefone">Telefone</Label>
            <Input
              inputMode="tel"
              placeholder="(69) 99999-9999"
              {...aria("telefone")}
              {...register("telefone")}
            />
            {erro("telefone")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="produtor-cpf">CPF (opcional)</Label>
          <Input inputMode="numeric" placeholder="000.000.000-00" {...aria("cpf")} {...register("cpf")} />
          {erro("cpf")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="produtor-observacao">Observação</Label>
          <Textarea maxLength={2000} {...aria("observacao")} {...register("observacao")} />
          {erro("observacao")}
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <Checkbox
                id="produtor-ativo"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v)}
              />
            )}
          />
          <Label htmlFor="produtor-ativo">Produtor ativo</Label>
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
