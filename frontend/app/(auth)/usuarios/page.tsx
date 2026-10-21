"use client";

import { useMemo, useRef, useState } from "react";
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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import type { UserWithRole } from "better-auth/plugins/admin";

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
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { PAGE_SIZES } from "@/lib/pageSizes";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { usePagination } from "@/hooks/use-pagination";
import { useBuscaDebounce } from "@/hooks/use-busca-debounce";
import { authClient } from "@/lib/auth-client";
import { dataHora, numero } from "@/lib/formato";
import { papelParaApi, usePapel } from "@/lib/papeis";
import { ehSemPermissao } from "@/lib/fetchData";
import { mensagemErroAuth } from "@/lib/erros-auth";
import { SENHA_DICA, senhaOpcionalSchema, senhaSchema } from "@/lib/senha";
import { usePapeisDinamicos } from "@/hooks/use-papeis";

type Usuario = UserWithRole;
type ListaUsuarios = { users: Usuario[]; total: number };

const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  columnMeta: {} as { className?: string },
});

const nomeSchema = z.string().trim().min(1, "Informe o nome").max(80, "No máximo 80 caracteres");
const emailSchema = z.email("Informe um e-mail válido").trim();

const schemaNovoUsuario = z.object({
  nome: nomeSchema,
  email: emailSchema,
  senha: senhaSchema,
  papel: z.string().min(1, "Selecione o papel"),
});
type FormNovoUsuario = z.infer<typeof schemaNovoUsuario>;

const schemaEditarUsuario = z.object({
  nome: nomeSchema,
  email: emailSchema,
  novaSenha: senhaOpcionalSchema,
});
type FormEditarUsuario = z.infer<typeof schemaEditarUsuario>;

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { ehAdmin: souAdmin, carregando } = usePapel();
  const papeis = usePapeisDinamicos(undefined, { enabled: souAdmin });
  const meuId = session?.user?.id;

  const [banir, setBanir] = useState<Usuario | null>(null);
  const [motivoBan, setMotivoBan] = useState("");
  const [remover, setRemover] = useState<Usuario | null>(null);
  const [trocaPapel, setTrocaPapel] = useState<{ usuario: Usuario; papel: string } | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Usuario | null>(null);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const { page, setPage, limit, setLimit, offset } = usePagination();
  const [termo, setTermo] = useQueryState("email", parseAsString.withDefault(""));
  const { busca, setBusca } = useBuscaDebounce(termo, setTermo, setPage);
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault("createdAt:desc"));
  const [campoOrdenacao, direcaoOrdenacao] = sort.split(":");
  const sorting = useMemo(
    () => [{ id: campoOrdenacao, desc: direcaoOrdenacao === "desc" }],
    [campoOrdenacao, direcaoOrdenacao],
  );

  const chaveLista = ["usuarios", { termo, sort, page, limit }];

  const usuarios = useQuery({
    queryKey: chaveLista,
    enabled: souAdmin,
    queryFn: async ({ signal }): Promise<ListaUsuarios> => {
      const resposta = await authClient.admin.listUsers({
        query: {
          limit,
          offset,
          sortBy: campoOrdenacao,
          sortDirection: direcaoOrdenacao === "desc" ? "desc" : "asc",
          ...(termo ? { searchValue: termo, searchField: "email", searchOperator: "contains" } : {}),
        },
        fetchOptions: { signal },
      });
      if (resposta.error) throw resposta.error;
      return resposta.data;
    },
  });

  const linhas = usuarios.data?.users ?? [];
  const total = usuarios.data?.total;
  const totalPages = typeof total === "number" ? Math.max(1, Math.ceil(total / limit)) : page;
  const foraDoIntervalo = linhas.length === 0 && (total ?? 0) > 0 && page > 1;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["usuarios"] });

  // Otimista: o select já mostra o papel novo; se a API recusar, volta ao anterior.
  const alterarRole = useMutation({
    mutationFn: async ({ userId, papel }: { userId: string; papel: string }) => {
      const r = await authClient.admin.setRole({ userId, role: papelParaApi(papel) });
      if (r.error) throw r.error;
    },
    onMutate: async ({ userId, papel }) => {
      await queryClient.cancelQueries({ queryKey: chaveLista });
      const anterior = queryClient.getQueryData<ListaUsuarios>(chaveLista);
      if (anterior) {
        queryClient.setQueryData<ListaUsuarios>(chaveLista, {
          ...anterior,
          users: anterior.users.map((u) => (u.id === userId ? { ...u, role: papel } : u)),
        });
      }
      return { anterior };
    },
    onSuccess: () => toast.success("Papel atualizado. As novas permissões valem em até 30 segundos."),
    onError: (erro, _variaveis, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(chaveLista, contexto.anterior);
      toast.error(mensagemErroAuth(erro, "Não foi possível alterar o papel."));
    },
    onSettled: () => invalidar(),
  });

  const banirMutation = useMutation({
    mutationFn: async () => {
      const r = await authClient.admin.banUser({
        userId: banir!.id,
        ...(motivoBan.trim() ? { banReason: motivoBan.trim() } : {}),
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Usuário banido — as sessões dele foram encerradas.");
      setBanir(null);
      setMotivoBan("");
      invalidar();
    },
    onError: (erro) => toast.error(mensagemErroAuth(erro, "Não foi possível banir.")),
  });

  const desbanir = useMutation({
    mutationFn: async (userId: string) => {
      const r = await authClient.admin.unbanUser({ userId });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Usuário desbanido.");
      invalidar();
    },
    onError: (erro) => toast.error(mensagemErroAuth(erro, "Não foi possível desbanir.")),
  });

  const removerMutation = useMutation({
    mutationFn: async () => {
      const r = await authClient.admin.removeUser({ userId: remover!.id });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Usuário removido.");
      setRemover(null);
      invalidar();
    },
    onError: (erro) => toast.error(mensagemErroAuth(erro, "Não foi possível remover o usuário.")),
  });

  const { nomes: nomesPapeis, descricaoDe: descricaoPapel } = papeis;
  const alterarPapel = alterarRole.mutate;
  const desbanirUsuario = desbanir.mutate;

  // Memoizado: o `flexRender` monta cada `cell` como componente — um array novo a
  // cada render trocaria o tipo e remontaria as células (o botão focado some).
  const colunas = useMemo<ColumnDef<typeof features, Usuario>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.name}
            {row.original.id === meuId && (
              <span className="ml-1.5 text-xs text-muted-foreground">(você)</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "email",
        header: "E-mail",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.email}
            {!row.original.emailVerified && (
              <span className="ml-1.5 text-xs text-muted-foreground">(não confirmado)</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: "role",
        header: "Papel",
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          const souEu = u.id === meuId;
          const atual = u.role ?? "usuario";
          return (
            <NativeSelect
              aria-label={`Papel de ${u.email}`}
              className="h-8 w-32 text-sm"
              title={descricaoPapel(atual)}
              value={atual}
              disabled={souEu}
              onChange={(e) => {
                const papel = e.target.value;
                if (papel === atual) return;
                // Entrar ou sair de admin pede confirmação; o resto aplica na hora.
                if (papel === "admin" || atual === "admin") setTrocaPapel({ usuario: u, papel });
                else alterarPapel({ userId: u.id, papel });
              }}
            >
              {nomesPapeis.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {p}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          );
        },
      },
      {
        accessorKey: "banned",
        header: "Situação",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.banned ? (
            <Badge variant="destructive">
              {row.original.banReason ? `Banido — ${row.original.banReason}` : "Banido"}
            </Badge>
          ) : (
            <Badge variant="outline">Ativo</Badge>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Criado em",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {dataHora(new Date(row.original.createdAt).toISOString())}
          </span>
        ),
      },
      {
        id: "acoes",
        header: "Ações",
        meta: { className: "w-36 text-right" },
        cell: ({ row }) => {
          const u = row.original;
          const souEu = u.id === meuId;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${u.email}`}
                title="Editar"
                onClick={() => setEditar(u)}
              >
                <Pencil className="size-4" />
              </Button>
              {u.banned ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Desbanir ${u.email}`}
                  title="Desbanir"
                  onClick={() => desbanirUsuario(u.id)}
                >
                  <UserCheck className="size-4 text-green-600" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Banir ${u.email}`}
                  title="Banir (encerra as sessões)"
                  disabled={souEu}
                  onClick={() => setBanir(u)}
                >
                  <Ban className="size-4 text-destructive" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover ${u.email}`}
                title="Remover usuário"
                disabled={souEu}
                onClick={() => setRemover(u)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [meuId, nomesPapeis, descricaoPapel, alterarPapel, desbanirUsuario],
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

  const confirmacao: Confirmacao | null = banir
    ? {
        titulo: "Banir usuário",
        descricao: (
          <>
            <strong>{banir.email}</strong> perde o acesso imediatamente: as sessões são encerradas e novos
            logins são recusados até o desbanimento. Os registros criados por ele permanecem.
          </>
        ),
        textoConfirmar: "Banir",
        destrutivo: true,
        pendente: banirMutation.isPending,
        onConfirmar: () => banirMutation.mutate(),
        focoAposConfirmar: tabelaRef,
        children: (
          <div className="grid gap-1.5 px-1">
            <Label htmlFor="ban-motivo">Motivo (opcional)</Label>
            <Input
              id="ban-motivo"
              value={motivoBan}
              onChange={(e) => setMotivoBan(e.target.value)}
              placeholder="abuso, cobrança pendente…"
              maxLength={200}
            />
          </div>
        ),
      }
    : remover
      ? {
          titulo: "Remover usuário",
          descricao: (
            <>
              <strong>{remover.email}</strong> é excluído do sistema. O histórico de auditoria continua
              apontando para o id dele. Esta ação não tem desfazer.
            </>
          ),
          textoConfirmar: "Remover",
          destrutivo: true,
          pendente: removerMutation.isPending,
          onConfirmar: () => removerMutation.mutate(),
          focoAposConfirmar: tabelaRef,
        }
      : trocaPapel
        ? {
            titulo:
              trocaPapel.papel === "admin"
                ? "Tornar administrador?"
                : "Remover privilégios de administrador?",
            descricao: (
              <>
                <strong>{trocaPapel.usuario.email}</strong> passa de{" "}
                <strong>{trocaPapel.usuario.role ?? "usuario"}</strong> para{" "}
                <strong>{trocaPapel.papel}</strong>.{" "}
                {trocaPapel.papel === "admin"
                  ? "Administradores têm acesso total, inclusive a usuários e papéis."
                  : "A conta perde o acesso à administração assim que confirmar."}
              </>
            ),
            textoConfirmar: "Alterar papel",
            destrutivo: trocaPapel.papel !== "admin",
            pendente: alterarRole.isPending,
            onConfirmar: () => {
              alterarRole.mutate({ userId: trocaPapel.usuario.id, papel: trocaPapel.papel });
              setTrocaPapel(null);
            },
          }
        : null;

  if (!carregando && !souAdmin) {
    return (
      <PageLayout title="Usuários">
        <EmptyState
          icon={ShieldCheck}
          title="Acesso restrito"
          description="Somente administradores gerenciam usuários e papéis."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Usuários"
      actions={
        <Button onClick={() => setNovoAberto(true)}>
          <Plus /> Novo usuário
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-full sm:w-64"
          placeholder="Buscar por e-mail…"
          aria-label="Buscar por e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {termo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusca("");
              void setTermo(null);
              void setPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="border" aria-busy={usuarios.isPending}>
        <Table aria-label="Lista de usuários" ref={tabelaRef} tabIndex={-1}>
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
            {usuarios.isPending ? (
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
            ) : usuarios.isError ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {ehSemPermissao(usuarios.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os usuários.{" "}
                      <Button variant="link" size="sm" onClick={() => usuarios.refetch()}>
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
                    "Nenhum usuário encontrado"
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

        {(usuarios.isPending || (total ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            {usuarios.isPending ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <p className="text-xs text-muted-foreground">
                {linhas.length === 0
                  ? `0 de ${numero(total)} usuários`
                  : `${numero(offset + 1)}–${numero(offset + linhas.length)} de ${numero(total)} usuários`}
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

      <NovoUsuario open={novoAberto} onOpenChange={setNovoAberto} onCriado={invalidar} />

      <EditarUsuario usuario={editar} onOpenChange={(open) => !open && setEditar(null)} onSalvo={invalidar} />

      <ConfirmacaoDialog
        confirmacao={confirmacao}
        onFechar={() => {
          setBanir(null);
          setMotivoBan("");
          setRemover(null);
          setTrocaPapel(null);
        }}
      />
    </PageLayout>
  );
}

/** Edição pelo admin: nome, e-mail e (opcional) redefinição de senha. */
function EditarUsuario({
  usuario,
  onOpenChange,
  onSalvo,
}: {
  usuario: Usuario | null;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
}) {
  return (
    <Sheet open={usuario !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Editar usuário</SheetTitle>
          <SheetDescription>
            O papel é alterado direto na tabela; aqui ficam os dados da conta.
          </SheetDescription>
        </SheetHeader>
        {usuario && (
          <FormularioEditarUsuario
            key={usuario.id}
            usuario={usuario}
            onOpenChange={onOpenChange}
            onSalvo={onSalvo}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function FormularioEditarUsuario({
  usuario,
  onOpenChange,
  onSalvo,
}: {
  usuario: Usuario;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
}) {
  const [erroApi, setErroApi] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormEditarUsuario>({
    resolver: zodResolver(schemaEditarUsuario),
    defaultValues: { nome: usuario.name, email: usuario.email, novaSenha: "" },
  });

  const salvar = useMutation({
    mutationFn: async (dados: FormEditarUsuario) => {
      const alterados: Record<string, string> = {};
      if (dados.nome !== usuario.name) alterados.name = dados.nome;
      if (dados.email !== usuario.email) alterados.email = dados.email;

      if (Object.keys(alterados).length) {
        const r = await authClient.admin.updateUser({ userId: usuario.id, data: alterados });
        if (r.error) throw r.error;
      }

      if (dados.novaSenha) {
        const r = await authClient.admin.setUserPassword({
          userId: usuario.id,
          newPassword: dados.novaSenha,
        });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      onOpenChange(false);
      onSalvo();
    },
    onError: (erro) => {
      const mensagem = mensagemErroAuth(erro, "Não foi possível salvar.");
      setErroApi(mensagem);
      toast.error(mensagem);
    },
  });

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((dados) => {
        setErroApi(null);
        salvar.mutate(dados);
      })}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {erroApi && (
          <p role="alert" className="text-xs text-destructive">
            {erroApi}
          </p>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="eu-nome">Nome</Label>
          <Input
            id="eu-nome"
            maxLength={80}
            aria-invalid={!!errors.nome}
            aria-describedby={errors.nome ? "eu-nome-erro" : undefined}
            {...register("nome")}
          />
          {errors.nome && (
            <p id="eu-nome-erro" role="alert" className="text-xs text-destructive">
              {errors.nome.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="eu-email">E-mail</Label>
          <Input
            id="eu-email"
            type="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "eu-email-erro" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="eu-email-erro" role="alert" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="eu-senha">Nova senha (opcional)</Label>
          <Input
            id="eu-senha"
            type="password"
            placeholder="deixe em branco para manter"
            autoComplete="new-password"
            aria-invalid={!!errors.novaSenha}
            aria-describedby={errors.novaSenha ? "eu-senha-erro" : undefined}
            {...register("novaSenha")}
          />
          {errors.novaSenha && (
            <p id="eu-senha-erro" role="alert" className="text-xs text-destructive">
              {errors.novaSenha.message}
            </p>
          )}
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

/**
 * Criação de usuário pelo admin — o cadastro público está desabilitado. O
 * usuário criado já entra com e-mail e senha (e a troca no rodapé do menu).
 */
function NovoUsuario({
  open,
  onOpenChange,
  onCriado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Novo usuário</SheetTitle>
          <SheetDescription>A conta nasce ativa e já entra com a senha definida aqui.</SheetDescription>
        </SheetHeader>
        {open && <FormularioNovoUsuario onOpenChange={onOpenChange} onCriado={onCriado} />}
      </SheetContent>
    </Sheet>
  );
}

function FormularioNovoUsuario({
  onOpenChange,
  onCriado,
}: {
  onOpenChange: (v: boolean) => void;
  onCriado: () => void;
}) {
  const papeis = usePapeisDinamicos();
  const [erroApi, setErroApi] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormNovoUsuario>({
    resolver: zodResolver(schemaNovoUsuario),
    defaultValues: { nome: "", email: "", senha: "", papel: "usuario" },
  });

  const criar = useMutation({
    mutationFn: async (dados: FormNovoUsuario) => {
      const r = await authClient.admin.createUser({
        name: dados.nome,
        email: dados.email,
        password: dados.senha,
        role: papelParaApi(dados.papel),
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success("Usuário criado — repasse a senha por um canal seguro.");
      onOpenChange(false);
      onCriado();
    },
    onError: (erro) => {
      const mensagem = mensagemErroAuth(erro, "Não foi possível criar o usuário.");
      setErroApi(mensagem);
      toast.error(mensagem);
    },
  });

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((dados) => {
        setErroApi(null);
        criar.mutate(dados);
      })}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {erroApi && (
          <p role="alert" className="text-xs text-destructive">
            {erroApi}
          </p>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="nu-nome">Nome</Label>
          <Input
            id="nu-nome"
            maxLength={80}
            aria-invalid={!!errors.nome}
            aria-describedby={errors.nome ? "nu-nome-erro" : undefined}
            {...register("nome")}
          />
          {errors.nome && (
            <p id="nu-nome-erro" role="alert" className="text-xs text-destructive">
              {errors.nome.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="nu-email">E-mail</Label>
          <Input
            id="nu-email"
            type="email"
            placeholder="pessoa@fslab.dev"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "nu-email-erro" : undefined}
            {...register("email")}
          />
          {errors.email && (
            <p id="nu-email-erro" role="alert" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="nu-senha">Senha inicial</Label>
          <Input
            id="nu-senha"
            type="password"
            placeholder={SENHA_DICA}
            autoComplete="new-password"
            aria-invalid={!!errors.senha}
            aria-describedby={errors.senha ? "nu-senha-erro" : "nu-senha-dica"}
            {...register("senha")}
          />
          {errors.senha ? (
            <p id="nu-senha-erro" role="alert" className="text-xs text-destructive">
              {errors.senha.message}
            </p>
          ) : (
            <p id="nu-senha-dica" className="text-xs text-muted-foreground">
              O usuário pode trocá-la depois em “Trocar senha”, no rodapé do menu.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="nu-papel">Papel</Label>
          <NativeSelect
            id="nu-papel"
            className="w-full"
            aria-invalid={!!errors.papel}
            aria-describedby={errors.papel ? "nu-papel-erro" : "nu-papel-dica"}
            {...register("papel")}
          >
            {papeis.nomes.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {papeis.descricaoDe(p) ? `${p} — ${papeis.descricaoDe(p)}` : p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errors.papel ? (
            <p id="nu-papel-erro" role="alert" className="text-xs text-destructive">
              {errors.papel.message}
            </p>
          ) : (
            <p id="nu-papel-dica" className="text-xs text-muted-foreground">
              O que cada papel pode fazer é definido na tela Papéis.
            </p>
          )}
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={criar.isPending}>
          {criar.isPending ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : (
            "Criar usuário"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
