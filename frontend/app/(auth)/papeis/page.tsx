"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import {
  flexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { toast } from "react-toastify";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

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
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { numero } from "@/lib/formato";
import type { Envelope } from "@/types/envelope";
import { usePapel } from "@/lib/papeis";
import {
  SORT_PAPEIS_PADRAO,
  usePapeisDinamicos,
  type PapelApi,
  type PermissaoItem,
} from "@/hooks/use-papeis";
import type { components } from "@/types/api";

type PapelComPermissoes = components["schemas"]["PapelComPermissoes"];

const ACOES: PermissaoItem["acao"][] = ["manage", "create", "read", "update", "delete"];

const schemaPapel = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome")
    .max(50, "No máximo 50 caracteres")
    .regex(/^[a-z][a-z0-9_-]*$/, "Use minúsculas, números, hífen e underscore, começando por letra"),
  descricao: z.string().trim().max(255, "No máximo 255 caracteres"),
});
type FormPapel = z.infer<typeof schemaPapel>;

const features = tableFeatures({
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

export default function PapeisPage() {
  const { ehAdmin, carregando } = usePapel();
  const queryClient = useQueryClient();

  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<PapelApi | null>(null);
  const [permissoesDe, setPermissoesDe] = useState<PapelApi | null>(null);
  const [excluir, setExcluir] = useState<PapelApi | null>(null);

  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault(SORT_PAPEIS_PADRAO));
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  // A mesma consulta (mesma queryKey) dos selects de papel: uma request, um cache.
  const papeis = usePapeisDinamicos(sort, { enabled: ehAdmin });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["papeis"] });

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/papeis/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Papel excluído.");
      setExcluir(null);
      invalidar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o papel.")),
  });

  const linhas = papeis.data?.data ?? [];

  const colunas: ColumnDef<typeof features, PapelApi>[] = [
    {
      accessorKey: "nome",
      header: "Nome",
      meta: { className: "w-44" },
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.nome}</span>,
    },
    {
      accessorKey: "descricao",
      header: "Descrição",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.descricao ?? "—"}</span>
      ),
    },
    {
      id: "permissoes",
      header: "Permissões",
      enableSorting: false,
      cell: ({ row }) => <ResumoPermissoes permissoes={row.original.permissoes} />,
    },
    {
      id: "acoes",
      header: "Ações",
      meta: { className: "w-36 text-right" },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Permissões"
            aria-label={`Permissões de ${row.original.nome}`}
            onClick={() => setPermissoesDe(row.original)}
          >
            <ShieldCheck className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Editar"
            aria-label={`Editar ${row.original.nome}`}
            onClick={() => setEditar(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Excluir"
            aria-label={`Excluir ${row.original.nome}`}
            onClick={() => setExcluir(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useTable({
    features,
    columns: colunas,
    data: linhas,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const [proxima] = typeof updater === "function" ? updater(sorting) : updater;
      void setSort(proxima ? `${proxima.id}:${proxima.desc ? "desc" : "asc"}` : null);
    },
  });

  if (!carregando && !ehAdmin) {
    return (
      <PageLayout title="Papéis">
        <EmptyState
          icon={Lock}
          title="Acesso restrito"
          description="Somente administradores gerenciam papéis e permissões."
        />
      </PageLayout>
    );
  }

  const confirmacaoExcluir: Confirmacao | null = excluir
    ? {
        titulo: `Excluir o papel “${excluir.nome}”?`,
        descricao:
          "O papel sai da lista, mas fica registrado no histórico. Não é possível excluir um papel que ainda tenha usuários.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
      }
    : null;

  return (
    <PageLayout
      title="Papéis"
      actions={
        <Button onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" /> Novo papel
        </Button>
      }
    >
      <div className="border" aria-busy={papeis.isPending}>
        <Table aria-label="Lista de papéis">
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
            {papeis.isPending ? (
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
            ) : papeis.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(papeis.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os papéis.{" "}
                      <Button variant="link" size="sm" onClick={() => papeis.refetch()}>
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
                  Nenhum papel cadastrado
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

        {(papeis.isPending || linhas.length > 0) && (
          <div className="border-t px-4 py-2">
            {papeis.isPending ? (
              <Skeleton className="h-3 w-32" />
            ) : (
              <p className="text-xs text-muted-foreground">Mostrando {numero(linhas.length)} papéis</p>
            )}
          </div>
        )}
      </div>

      {/* Criar */}
      <Sheet open={novoAberto} onOpenChange={setNovoAberto}>
        <SheetContent className="flex flex-col p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Novo papel</SheetTitle>
            <SheetDescription>
              O nome identifica o papel e é o que aparece na lista de papéis dos usuários.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioPapel
              onFechar={() => setNovoAberto(false)}
              onSalvo={() => {
                setNovoAberto(false);
                invalidar();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Editar */}
      <Sheet open={!!editar} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex flex-col p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Editar papel</SheetTitle>
            <SheetDescription>
              Renomear atualiza automaticamente os usuários que têm este papel.
            </SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioPapel
              key={editar.id}
              registro={editar}
              onFechar={() => setEditar(null)}
              onSalvo={() => {
                setEditar(null);
                invalidar();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Permissões */}
      <Sheet open={!!permissoesDe} onOpenChange={(aberto) => !aberto && setPermissoesDe(null)}>
        <SheetContent className="flex flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Permissões — {permissoesDe?.nome}</SheetTitle>
            <SheetDescription>
              Cada linha é uma ação sobre um recurso. “manage” libera todas as ações; o recurso “all” libera
              todos os recursos. Vale imediatamente ao salvar.
            </SheetDescription>
          </SheetHeader>
          {permissoesDe && (
            <EditorPermissoes
              key={permissoesDe.id}
              papel={permissoesDe}
              onSalvo={() => {
                setPermissoesDe(null);
                invalidar();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Excluir */}
      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

/** Badges com as permissões do papel — já vêm na listagem (`incluir=permissoes`). */
function ResumoPermissoes({ permissoes }: { permissoes?: PermissaoItem[] }) {
  if (!permissoes) return <span className="text-sm text-muted-foreground">—</span>;
  if (permissoes.length === 0) return <span className="text-sm text-muted-foreground">nenhuma</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {permissoes.map((p) => (
        <Badge key={`${p.acao}:${p.subject}`} variant="secondary" className="font-mono text-xs">
          {p.acao} {p.subject}
        </Badge>
      ))}
    </div>
  );
}

/** Criar/editar nome e descrição. Montado só com o sheet aberto (sem useEffect). */
function FormularioPapel({
  registro,
  onFechar,
  onSalvo,
}: {
  registro?: PapelApi;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormPapel>({
    resolver: zodResolver(schemaPapel),
    defaultValues: { nome: registro?.nome ?? "", descricao: registro?.descricao ?? "" },
  });

  const salvar = useMutation({
    mutationFn: (dados: FormPapel) => {
      const body = { nome: dados.nome, descricao: dados.descricao || undefined };
      return registro
        ? fetchData(`/papeis/${registro.id}`, { method: "PATCH", body })
        : fetchData("/papeis", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(registro ? "Papel atualizado." : "Papel criado.");
      onSalvo();
    },
    onError: (erro) => {
      const api = erro as ErroApi;
      if (api.status === 400 && api.erros?.length) setErrosApi(api.erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o papel."));
    },
  });

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
          <Label htmlFor="papel-nome">Nome</Label>
          <Input
            id="papel-nome"
            placeholder="gestor-vendas"
            maxLength={50}
            aria-invalid={!!errors.nome}
            aria-describedby={errors.nome ? "papel-nome-erro" : "papel-nome-dica"}
            {...register("nome")}
          />
          {errors.nome ? (
            <p id="papel-nome-erro" role="alert" className="text-xs text-destructive">
              {errors.nome.message}
            </p>
          ) : (
            <p id="papel-nome-dica" className="text-xs text-muted-foreground">
              Minúsculas, números, hífen e underscore (ex.: gestor-vendas).
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="papel-descricao">Descrição</Label>
          <Input
            id="papel-descricao"
            placeholder="O que este papel pode fazer"
            maxLength={255}
            aria-invalid={!!errors.descricao}
            aria-describedby={errors.descricao ? "papel-descricao-erro" : undefined}
            {...register("descricao")}
          />
          {errors.descricao && (
            <p id="papel-descricao-erro" role="alert" className="text-xs text-destructive">
              {errors.descricao.message}
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

/**
 * Substitui o conjunto de permissões do papel (PUT /papeis/:id/permissoes).
 * As permissões iniciais vêm da própria linha; sem elas (API antiga), busca o detalhe.
 */
function EditorPermissoes({ papel, onSalvo }: { papel: PapelApi; onSalvo: () => void }) {
  const detalhe = useQuery({
    queryKey: ["papeis", papel.id],
    queryFn: ({ signal }) => fetchData<Envelope<PapelComPermissoes>>(`/papeis/${papel.id}`, { signal }),
    enabled: papel.permissoes === undefined,
  });

  if (papel.permissoes === undefined && detalhe.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <LinhasPermissoes
      papel={papel}
      iniciais={papel.permissoes ?? detalhe.data?.data.permissoes ?? []}
      onSalvo={onSalvo}
    />
  );
}

function LinhasPermissoes({
  papel,
  iniciais,
  onSalvo,
}: {
  papel: PapelApi;
  iniciais: PermissaoItem[];
  onSalvo: () => void;
}) {
  const queryClient = useQueryClient();
  const [linhas, setLinhas] = useState<PermissaoItem[]>(iniciais);

  const salvar = useMutation({
    mutationFn: () =>
      fetchData(`/papeis/${papel.id}/permissoes`, {
        method: "PUT",
        body: { permissoes: linhas.filter((l) => l.subject.trim()) },
      }),
    onSuccess: () => {
      toast.success("Permissões atualizadas.");
      queryClient.invalidateQueries({ queryKey: ["papeis", papel.id] });
      onSalvo();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível salvar as permissões.")),
  });

  const atualizar = (i: number, patch: Partial<PermissaoItem>) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {linhas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma permissão — este papel só vê o que é público.
          </p>
        )}
        {linhas.map((linha, i) => (
          <div key={i} className="flex items-center gap-2">
            <NativeSelect
              aria-label={`Ação da permissão ${i + 1}`}
              className="h-9 w-32"
              value={linha.acao}
              onChange={(e) => atualizar(i, { acao: e.target.value as PermissaoItem["acao"] })}
            >
              {ACOES.map((acao) => (
                <option key={acao} value={acao}>
                  {acao}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label={`Recurso da permissão ${i + 1}`}
              className="h-9 flex-1 font-mono text-sm"
              value={linha.subject}
              onChange={(e) => atualizar(i, { subject: e.target.value })}
              placeholder='Recurso (ex.: HistoricoAlteracao) ou "all"'
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover permissão ${i + 1}`}
              title="Remover"
              onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setLinhas((atual) => [...atual, { acao: "read", subject: "" }])}
        >
          <Plus className="size-4" /> Adicionar permissão
        </Button>
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : (
            "Salvar permissões"
          )}
        </Button>
      </SheetFooter>
    </div>
  );
}
