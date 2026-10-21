"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";

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
import { EmptyState } from "@/components/ui/empty-state";
import { Seletor } from "@/components/seletor";
import { SeletorPessoa, type Pessoa } from "@/components/seletor-pessoa";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { ehSemPermissao, fetchData, mensagemDeErro } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, moeda, numero, telefone } from "@/lib/formato";
import { centavosDeTexto, textoDeCentavos } from "@/lib/dinheiro";
import { usePapel } from "@/lib/papeis";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Projeto = components["schemas"]["Projeto"];
type Membro = components["schemas"]["MembroEquipe"];
type Adesao = components["schemas"]["AdesaoAssociacao"];
type Associacao = components["schemas"]["Associacao"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type TipoEquipe = Membro["tipo"];

const TIPOS_EQUIPE: { valor: TipoEquipe; rotulo: string }[] = [
  { valor: "coordenador", rotulo: "Coordenador(a)" },
  { valor: "tecnico", rotulo: "Técnico(a)" },
  { valor: "estudante", rotulo: "Estudante" },
  { valor: "administrativo", rotulo: "Administrativo" },
];
const rotuloTipo = (t: TipoEquipe) => TIPOS_EQUIPE.find((x) => x.valor === t)?.rotulo ?? t;
const SITUACAO: Record<Projeto["situacao"], string> = {
  planejado: "Planejado",
  em_execucao: "Em execução",
  encerrado: "Encerrado",
};
const LIMITE_ADESOES = 10;

export default function ProjetoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { podeGerenciar, podeEditarCampo } = usePapel();

  const projeto = useQuery({
    queryKey: ["projetos", id],
    queryFn: ({ signal }) => fetchData<Envelope<Projeto>>(`/projetos/${id}`, { signal }),
  });
  const p = projeto.data?.data;
  const encerrado = p?.situacao === "encerrado";

  if (projeto.isError) {
    return (
      <PageLayout title="Projeto">
        <EmptyState
          title={
            ehSemPermissao(projeto.error) ? "Você não tem permissão para ver isto." : "Projeto não encontrado"
          }
          description="Ele pode ter sido excluído, ou você não faz parte da equipe dele."
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/projetos" />}>
              <ArrowLeft className="size-4" /> Voltar para projetos
            </Button>
          }
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={p ? p.sigla : "Projeto"}
      titleExtra={p && <Badge variant={encerrado ? "secondary" : "default"}>{SITUACAO[p.situacao]}</Badge>}
      actions={
        <Button variant="outline" nativeButton={false} render={<Link href="/projetos" />}>
          <ArrowLeft className="size-4" /> Projetos
        </Button>
      }
    >
      <section aria-labelledby="dados-titulo" className="border p-4">
        <h2 id="dados-titulo" className="sr-only">
          Dados do projeto
        </h2>
        {projeto.isPending ? (
          <div className="grid gap-2" aria-busy>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          p && (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium">{p.nome}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vigência</dt>
                <dd className="tabular-nums">
                  {dataCalendario(p.inicio)} a {dataCalendario(p.fim)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Valor total</dt>
                <dd className="tabular-nums">{moeda(p.valorTotalCentavos)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Instrumento</dt>
                <dd>{p.numeroInstrumento ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Concedente / executor</dt>
                <dd>{[p.concedente, p.executor].filter(Boolean).join(" / ") || "—"}</dd>
              </div>
            </dl>
          )
        )}
      </section>

      <Equipe projetoId={id} editavel={podeGerenciar("gestor") && !encerrado} />
      <Adesoes projetoId={id} editavel={podeEditarCampo && !encerrado} />
    </PageLayout>
  );
}

// ─── Equipe ────────────────────────────────────────────────────────────────

const schemaMembro = z
  .object({
    modo: z.enum(["existente", "nova"]),
    pessoa: z.custom<Pessoa | null>(),
    nome: z.string().trim().max(200, "No máximo 200 caracteres"),
    email: z.union([z.literal(""), z.email("E-mail inválido")]),
    telefone: z.string().trim().max(20, "Telefone inválido"),
    tipo: z.enum(["coordenador", "tecnico", "estudante", "administrativo"]),
    funcao: z.string().trim().max(200, "No máximo 200 caracteres"),
    instituicao: z.string().trim().max(200, "No máximo 200 caracteres"),
    curso: z.string().trim().max(200, "No máximo 200 caracteres"),
    contratadoEm: z.string(),
    desligadoEm: z.string(),
  })
  .refine((v) => v.modo === "nova" || v.pessoa, { message: "Escolha a pessoa", path: ["pessoa"] })
  .refine((v) => v.modo === "existente" || v.nome, { message: "Informe o nome", path: ["nome"] })
  .refine((v) => !v.contratadoEm || !v.desligadoEm || v.desligadoEm >= v.contratadoEm, {
    message: "O desligamento não pode ser antes da contratação",
    path: ["desligadoEm"],
  });
type FormMembro = z.infer<typeof schemaMembro>;

function Equipe({ projetoId, editavel }: { projetoId: string; editavel: boolean }) {
  const queryClient = useQueryClient();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Membro | null>(null);
  const [remover, setRemover] = useState<Membro | null>(null);

  const equipe = useQuery({
    queryKey: ["projetos", projetoId, "equipe"],
    queryFn: ({ signal }) => fetchData<Envelope<Membro[]>>(`/projetos/${projetoId}/equipe`, { signal }),
  });
  const membros = equipe.data?.data ?? [];

  const removerMutation = useMutation({
    mutationFn: () => fetchData(`/projetos/${projetoId}/equipe/${remover!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Pessoa retirada da equipe.");
      setRemover(null);
      queryClient.invalidateQueries({ queryKey: ["projetos", projetoId, "equipe"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível retirar da equipe.")),
  });

  const confirmacao: Confirmacao | null = remover
    ? {
        titulo: `Retirar ${remover.nome} da equipe?`,
        descricao: "A pessoa deixa de ver este projeto. O que ela já registrou continua no projeto.",
        textoConfirmar: "Retirar",
        destrutivo: true,
        pendente: removerMutation.isPending,
        onConfirmar: () => removerMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="equipe-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="equipe-titulo" className="text-lg font-semibold">
            Equipe
          </h2>
          <p className="text-sm text-muted-foreground">
            Só quem está na equipe vê os registros deste projeto.
          </p>
        </div>
        {editavel && (
          <Button variant="outline" onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Incluir na equipe
          </Button>
        )}
      </div>

      <div className="border" aria-busy={equipe.isPending}>
        <Table aria-label="Equipe do projeto">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Atuação</TableHead>
              <TableHead className="hidden md:table-cell">Contato</TableHead>
              <TableHead className="hidden lg:table-cell">Período</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipe.isPending ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : equipe.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Erro ao carregar a equipe.{" "}
                  <Button variant="link" size="sm" onClick={() => equipe.refetch()}>
                    Tentar novamente
                  </Button>
                </TableCell>
              </TableRow>
            ) : membros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Ninguém na equipe ainda
                </TableCell>
              </TableRow>
            ) : (
              membros.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{rotuloTipo(m.tipo)}</span>
                      {m.funcao && <span className="text-xs text-muted-foreground">{m.funcao}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {m.email ?? (m.telefone ? telefone(m.telefone) : "—")}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                    {m.contratadoEm ? dataCalendario(m.contratadoEm) : "—"}
                    {m.desligadoEm && ` a ${dataCalendario(m.desligadoEm)}`}
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Editar"
                          aria-label={`Editar a atuação de ${m.nome}`}
                          onClick={() => setEditar(m)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Retirar"
                          aria-label={`Retirar ${m.nome} da equipe`}
                          onClick={() => setRemover(m)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={novoAberto} onOpenChange={setNovoAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Incluir na equipe</SheetTitle>
            <SheetDescription>
              Escolha alguém já cadastrado ou cadastre a pessoa agora. Pessoa nova só acessa o painel depois
              que um administrador definir a senha dela.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && <FormularioMembro projetoId={projetoId} onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Atuação de {editar?.nome}</SheetTitle>
            <SheetDescription>
              Com a data de desligamento passada, a pessoa deixa de ver o projeto.
            </SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioMembro
              key={editar.id}
              projetoId={projetoId}
              registro={editar}
              onFechar={() => setEditar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setRemover(null)} />
    </section>
  );
}

function FormularioMembro({
  projetoId,
  registro,
  onFechar,
}: {
  projetoId: string;
  registro?: Membro;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormMembro>({
    resolver: zodResolver(schemaMembro),
    defaultValues: {
      modo: "existente",
      pessoa: registro
        ? {
            id: registro.userId,
            nome: registro.nome,
            email: registro.email,
            telefone: registro.telefone,
            papel: null,
          }
        : null,
      nome: "",
      email: "",
      telefone: "",
      tipo: registro?.tipo ?? "tecnico",
      funcao: registro?.funcao ?? "",
      instituicao: registro?.instituicao ?? "",
      curso: registro?.curso ?? "",
      contratadoEm: registro?.contratadoEm ?? "",
      desligadoEm: registro?.desligadoEm ?? "",
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
    mutationFn: (d: FormMembro) => {
      const atuacao = {
        tipo: d.tipo,
        funcao: d.funcao || null,
        instituicao: d.instituicao || null,
        curso: d.curso || null,
        contratadoEm: d.contratadoEm || null,
        desligadoEm: d.desligadoEm || null,
      };
      if (registro) {
        return fetchData(`/projetos/${projetoId}/equipe/${registro.id}`, { method: "PATCH", body: atuacao });
      }
      const pessoa =
        d.modo === "existente"
          ? { userId: d.pessoa!.id }
          : { pessoa: { nome: d.nome, email: d.email || undefined, telefone: d.telefone || undefined } };
      return fetchData(`/projetos/${projetoId}/equipe`, { method: "POST", body: { ...pessoa, ...atuacao } });
    },
    onSuccess: () => {
      toast.success(registro ? "Atuação atualizada." : "Pessoa incluída na equipe.");
      queryClient.invalidateQueries({ queryKey: ["projetos", projetoId, "equipe"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar."));
    },
  });

  const aria = (nome: keyof FormMembro) => ({
    id: `membro-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `membro-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormMembro) =>
    errors[nome] && (
      <p id={`membro-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message as string}
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

        {!registro && (
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
        )}

        {!registro && modo === "existente" && (
          <div className="grid gap-1.5">
            <Label htmlFor="membro-pessoa">Buscar pessoa</Label>
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
        )}

        {!registro && modo === "nova" && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="membro-nome">Nome</Label>
              <Input maxLength={200} {...aria("nome")} {...register("nome")} />
              {erro("nome")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="membro-email">E-mail (opcional)</Label>
                <Input type="email" {...aria("email")} {...register("email")} />
                {erro("email")}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="membro-telefone">Telefone (opcional)</Label>
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
          <Label htmlFor="membro-tipo">Atuação</Label>
          <NativeSelect className="w-full" {...aria("tipo")} {...register("tipo")}>
            {TIPOS_EQUIPE.map((t) => (
              <NativeSelectOption key={t.valor} value={t.valor}>
                {t.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="membro-funcao">Função</Label>
          <Input
            placeholder="Coordenador do eixo Agricultura Familiar"
            maxLength={200}
            {...aria("funcao")}
            {...register("funcao")}
          />
          {erro("funcao")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="membro-instituicao">Instituição</Label>
            <Input maxLength={200} {...aria("instituicao")} {...register("instituicao")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="membro-curso">Curso (estudante)</Label>
            <Input maxLength={200} {...aria("curso")} {...register("curso")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="membro-contratadoEm">Contratação</Label>
            <Input type="date" {...aria("contratadoEm")} {...register("contratadoEm")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="membro-desligadoEm">Desligamento</Label>
            <Input type="date" {...aria("desligadoEm")} {...register("desligadoEm")} />
            {erro("desligadoEm")}
          </div>
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
            "Incluir"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

// ─── Associações participantes ─────────────────────────────────────────────

const schemaAdesao = z.object({
  associacaoId: z.string().min(1, "Escolha a associação"),
  aderiuEm: z.string(),
  interesseDeclarado: z.enum(["", "sim", "nao"]),
  demandaInicial: z.string().trim().max(2000, "No máximo 2000 caracteres"),
  valorSugerido: z
    .string()
    .transform((v) => centavosDeTexto(v))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Valor inválido (ex.: 350.000,00)"),
  parceriaFormalizadaEm: z.string(),
  ativo: z.boolean(),
});
type FormAdesao = z.input<typeof schemaAdesao>;
type FormAdesaoSaida = z.output<typeof schemaAdesao>;

function Adesoes({ projetoId, editavel }: { projetoId: string; editavel: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [novaAberta, setNovaAberta] = useState(false);
  const [editar, setEditar] = useState<Adesao | null>(null);
  const [remover, setRemover] = useState<Adesao | null>(null);
  const offset = (page - 1) * LIMITE_ADESOES;

  const adesoes = useQuery({
    queryKey: ["projetos", projetoId, "associacoes", { page }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Adesao[], MetaPaginacao>>(`/projetos/${projetoId}/associacoes`, {
        query: { limit: LIMITE_ADESOES, offset },
        signal,
      }),
  });
  const linhas = adesoes.data?.data ?? [];
  const total = adesoes.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMITE_ADESOES));

  const removerMutation = useMutation({
    mutationFn: () => fetchData(`/projetos/${projetoId}/associacoes/${remover!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Adesão desfeita.");
      setRemover(null);
      queryClient.invalidateQueries({ queryKey: ["projetos", projetoId, "associacoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível desfazer a adesão.")),
  });

  const confirmacao: Confirmacao | null = remover
    ? {
        titulo: `Desfazer a adesão de ${remover.sigla}?`,
        descricao:
          "Só é possível enquanto a associação não tiver visitas ou entregas neste projeto — depois disso, marque a adesão como inativa.",
        textoConfirmar: "Desfazer",
        destrutivo: true,
        pendente: removerMutation.isPending,
        onConfirmar: () => removerMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="adesoes-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="adesoes-titulo" className="text-lg font-semibold">
            Associações participantes
          </h2>
          <p className="text-sm text-muted-foreground">
            Interesse, demanda inicial e parceria (Meta 2) são por projeto.
          </p>
        </div>
        {editavel && (
          <Button variant="outline" onClick={() => setNovaAberta(true)}>
            <Plus className="size-4" /> Registrar adesão
          </Button>
        )}
      </div>

      <div className="border" aria-busy={adesoes.isPending}>
        <Table aria-label="Associações participantes do projeto">
          <TableHeader>
            <TableRow>
              <TableHead>Associação</TableHead>
              <TableHead className="hidden md:table-cell">Município</TableHead>
              <TableHead className="hidden lg:table-cell">Demanda inicial</TableHead>
              <TableHead>Parceria</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {adesoes.isPending ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : adesoes.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  {ehSemPermissao(adesoes.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as associações.{" "}
                      <Button variant="link" size="sm" onClick={() => adesoes.refetch()}>
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhuma associação participa deste projeto ainda
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {a.sigla}
                        {!a.ativo && (
                          <Badge variant="secondary" className="ml-2">
                            inativa
                          </Badge>
                        )}
                      </span>
                      {a.nome && <span className="text-xs text-muted-foreground">{a.nome}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{a.municipio}</TableCell>
                  <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell">
                    {a.demandaInicial ?? "—"}
                    {a.valorSugeridoCentavos !== null && ` (${moeda(a.valorSugeridoCentavos)})`}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {a.parceriaFormalizadaEm ? dataCalendario(a.parceriaFormalizadaEm) : "—"}
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Editar"
                          aria-label={`Editar a adesão de ${a.sigla}`}
                          onClick={() => setEditar(a)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Desfazer adesão"
                          aria-label={`Desfazer a adesão de ${a.sigla}`}
                          onClick={() => setRemover(a)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {total > LIMITE_ADESOES && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
            <p className="text-xs text-muted-foreground">
              {numero(offset + 1)}–{numero(offset + linhas.length)} de {numero(total)} associações
            </p>
            <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      <Sheet open={novaAberta} onOpenChange={setNovaAberta}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Registrar adesão</SheetTitle>
            <SheetDescription>A associação passa a participar deste projeto.</SheetDescription>
          </SheetHeader>
          {novaAberta && <FormularioAdesao projetoId={projetoId} onFechar={() => setNovaAberta(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Adesão de {editar?.sigla}</SheetTitle>
            <SheetDescription>Dados desta associação neste projeto.</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioAdesao
              key={editar.id}
              projetoId={projetoId}
              registro={editar}
              onFechar={() => setEditar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setRemover(null)} />
    </section>
  );
}

function FormularioAdesao({
  projetoId,
  registro,
  onFechar,
}: {
  projetoId: string;
  registro?: Adesao;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);

  // Associações para escolher (a API já devolve só as visíveis a quem pede)
  const associacoes = useQuery({
    queryKey: ["associacoes", { limit: 200, sort: "sigla:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Associacao[], MetaPaginacao>>("/associacoes", {
        query: { limit: 200, sort: "sigla:asc" },
        signal,
      }),
    enabled: !registro,
  });
  const opcoes = useMemo(
    () =>
      (associacoes.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.sigla} — ${a.municipioNome}` })),
    [associacoes.data],
  );

  const form = useForm<FormAdesao, unknown, FormAdesaoSaida>({
    resolver: zodResolver(schemaAdesao),
    defaultValues: {
      associacaoId: registro?.associacaoId ?? "",
      aderiuEm: registro?.aderiuEm ?? "",
      interesseDeclarado:
        registro?.interesseDeclarado === true ? "sim" : registro?.interesseDeclarado === false ? "nao" : "",
      demandaInicial: registro?.demandaInicial ?? "",
      valorSugerido: textoDeCentavos(registro?.valorSugeridoCentavos),
      parceriaFormalizadaEm: registro?.parceriaFormalizadaEm ?? "",
      ativo: registro?.ativo ?? true,
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: ({ associacaoId, valorSugerido, interesseDeclarado, ...d }: FormAdesaoSaida) => {
      const body = {
        aderiuEm: d.aderiuEm || null,
        interesseDeclarado: interesseDeclarado === "" ? null : interesseDeclarado === "sim",
        demandaInicial: d.demandaInicial || null,
        valorSugeridoCentavos: valorSugerido,
        parceriaFormalizadaEm: d.parceriaFormalizadaEm || null,
        ativo: d.ativo,
      };
      return registro
        ? fetchData(`/projetos/${projetoId}/associacoes/${registro.id}`, { method: "PATCH", body })
        : fetchData(`/projetos/${projetoId}/associacoes`, {
            method: "POST",
            body: { associacaoId, ...body },
          });
    },
    onSuccess: () => {
      toast.success(registro ? "Adesão atualizada." : "Adesão registrada.");
      queryClient.invalidateQueries({ queryKey: ["projetos", projetoId, "associacoes"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a adesão."));
    },
  });

  const aria = (nome: keyof FormAdesao) => ({
    id: `adesao-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `adesao-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormAdesao) =>
    errors[nome] && (
      <p id={`adesao-${nome}-erro`} role="alert" className="text-xs text-destructive">
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

        {!registro && (
          <div className="grid gap-1.5">
            <Label htmlFor="adesao-associacaoId">Associação</Label>
            <Controller
              control={control}
              name="associacaoId"
              render={({ field }) => (
                <Seletor
                  className="w-full"
                  opcoes={opcoes}
                  valor={field.value}
                  onValorChange={(v) => field.onChange(v ?? "")}
                  placeholder="Buscar associação…"
                  vazio="Nenhuma associação encontrada."
                  disabled={associacoes.isPending}
                  {...aria("associacaoId")}
                />
              )}
            />
            {erro("associacaoId")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="adesao-aderiuEm">Aderiu em</Label>
            <Input type="date" {...aria("aderiuEm")} {...register("aderiuEm")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adesao-interesseDeclarado">Interesse declarado</Label>
            <NativeSelect
              className="w-full"
              {...aria("interesseDeclarado")}
              {...register("interesseDeclarado")}
            >
              <NativeSelectOption value="">Não informado</NativeSelectOption>
              <NativeSelectOption value="sim">Sim</NativeSelectOption>
              <NativeSelectOption value="nao">Não</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="adesao-demandaInicial">Demanda inicial</Label>
          <Textarea
            placeholder="Trator, grade, carreta, calcário…"
            {...aria("demandaInicial")}
            {...register("demandaInicial")}
          />
          {erro("demandaInicial")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="adesao-valorSugerido">Valor sugerido (R$)</Label>
            <Input
              inputMode="decimal"
              placeholder="350.000,00"
              {...aria("valorSugerido")}
              {...register("valorSugerido")}
            />
            {erro("valorSugerido")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adesao-parceriaFormalizadaEm">Parceria formalizada em</Label>
            <Input type="date" {...aria("parceriaFormalizadaEm")} {...register("parceriaFormalizadaEm")} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <Checkbox id="adesao-ativo" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
            )}
          />
          <Label htmlFor="adesao-ativo">Participação ativa</Label>
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
