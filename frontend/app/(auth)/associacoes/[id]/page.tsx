"use client";

import { use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ArrowLeft, Download, MapPin, MessageCircle, Pencil, Plus, Star, Trash2, Upload } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { SeletorPessoa, type Pessoa } from "@/components/seletor-pessoa";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, numero, telefone } from "@/lib/formato";
import { env } from "@/lib/env";
import { usePapel } from "@/lib/papeis";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";
import { FormularioAssociacao, mascaraCnpj, type Associacao } from "../formulario-associacao";

type Contato = components["schemas"]["ContatoAssociacao"];
type Documento = components["schemas"]["DocumentoAssociacao"];
type TipoDocumento = components["schemas"]["TipoDocumento"];
type Diagnostico = components["schemas"]["DiagnosticoAssociacao"];
type OpcaoDiagnostico = components["schemas"]["OpcaoDiagnostico"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type FuncaoContato = Contato["funcao"];
type SituacaoDocumento = Documento["situacao"];
type GrupoOpcao = OpcaoDiagnostico["grupo"];

const FUNCOES: { valor: FuncaoContato; rotulo: string }[] = [
  { valor: "presidente", rotulo: "Presidente" },
  { valor: "contato", rotulo: "Contato" },
  { valor: "outro", rotulo: "Outro" },
];
const rotuloFuncao = (f: FuncaoContato) => FUNCOES.find((x) => x.valor === f)?.rotulo ?? f;

const SITUACOES_DOC: { valor: SituacaoDocumento; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "recebido", rotulo: "Recebido" },
  { valor: "validado", rotulo: "Validado" },
  { valor: "rejeitado", rotulo: "Rejeitado" },
];
const rotuloSituacaoDoc = (s: SituacaoDocumento) => SITUACOES_DOC.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacaoDoc = (s: SituacaoDocumento) =>
  s === "validado" ? "default" : s === "rejeitado" ? "destructive" : "secondary";

const RESPOSTAS = { sim: "Sim", nao: "Não", parcialmente: "Parcialmente", nao_sei: "Não sei" } as const;
const GRUPOS: Record<GrupoOpcao, string> = {
  atividade_produtiva: "Atividades produtivas",
  problema_solo: "Problemas do solo",
  tema_capacitacao: "Temas de capacitação de interesse",
  parceiro_institucional: "Parceiros institucionais",
  apoio_necessario: "Apoio necessário",
};

/** Formatos aceitos pela API para documentos (PDF ou imagem) e o limite de tamanho. */
const ACEITA_DOCUMENTO = "application/pdf,image/jpeg,image/png,image/webp,image/gif";
const MAX_ARQUIVO_BYTES = 20 * 1024 * 1024;

const linkWhatsapp = (fone: string) => `https://wa.me/${fone.replace(/\D/g, "")}`;
const linkMapa = (a: Associacao) =>
  a.mapaUrl ??
  (a.latitude !== null && a.longitude !== null
    ? `https://www.google.com/maps?q=${a.latitude},${a.longitude}`
    : null);
const simNao = (v: boolean | null) => (v === null ? "—" : v ? "Sim" : "Não");

export default function AssociacaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { podeEditarCampo } = usePapel();
  const [editarAberto, setEditarAberto] = useState(false);

  const associacao = useQuery({
    queryKey: ["associacoes", id],
    queryFn: ({ signal }) => fetchData<Envelope<Associacao>>(`/associacoes/${id}`, { signal }),
  });
  const a = associacao.data?.data;

  if (associacao.isError) {
    return (
      <PageLayout title="Associação">
        <EmptyState
          title={
            ehSemPermissao(associacao.error)
              ? "Você não tem permissão para ver isto."
              : "Associação não encontrada"
          }
          description="Ela pode ter sido excluída, ou não participa de nenhum projeto da sua equipe."
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/associacoes" />}>
              <ArrowLeft className="size-4" /> Voltar para associações
            </Button>
          }
        />
      </PageLayout>
    );
  }

  const mapa = a ? linkMapa(a) : null;

  return (
    <PageLayout
      title={a ? a.sigla : "Associação"}
      titleExtra={
        a && (
          <>
            <Badge variant={a.ativo ? "default" : "secondary"}>{a.ativo ? "Ativa" : "Inativa"}</Badge>
            {a.dadosRevisados && <Badge variant="outline">dados revisados</Badge>}
          </>
        )
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/associacoes" />}>
            <ArrowLeft className="size-4" /> Associações
          </Button>
          {podeEditarCampo && a && (
            <Button onClick={() => setEditarAberto(true)}>
              <Pencil className="size-4" /> Editar
            </Button>
          )}
        </div>
      }
    >
      <section aria-labelledby="dados-titulo" className="border p-4">
        <h2 id="dados-titulo" className="sr-only">
          Dados da associação
        </h2>
        {associacao.isPending ? (
          <div className="grid gap-2" aria-busy>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          a && (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium">{a.nome ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">CNPJ</dt>
                <dd className="tabular-nums">{a.cnpj ? mascaraCnpj(a.cnpj) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Município</dt>
                <dd>
                  {a.municipioNome}/{a.uf}
                  {a.distrito && <span className="text-muted-foreground"> · {a.distrito}</span>}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Endereço</dt>
                <dd>{a.endereco ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Produtores / famílias</dt>
                <dd className="tabular-nums">
                  {numero(a.numProdutores)} / {numero(a.numFamilias)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Área média</dt>
                <dd className="tabular-nums">
                  {a.areaMediaHa === null
                    ? "—"
                    : `${a.areaMediaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Localização</dt>
                <dd>
                  {mapa ? (
                    <a
                      href={mapa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      <MapPin className="size-3.5" /> Ver no mapa
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Grupo do WhatsApp</dt>
                <dd>
                  {a.grupoWhatsappUrl ? (
                    <a
                      href={a.grupoWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      <MessageCircle className="size-3.5" /> Entrar no grupo
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )
        )}
      </section>

      <Contatos associacaoId={id} editavel={podeEditarCampo} />
      <Documentos associacaoId={id} editavel={podeEditarCampo} />
      <DiagnosticoSecao associacaoId={id} editavel={podeEditarCampo} />

      <Sheet open={editarAberto} onOpenChange={setEditarAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Editar {a?.sigla}</SheetTitle>
            <SheetDescription>
              O cadastro é o mesmo em todos os projetos de que ela participa.
            </SheetDescription>
          </SheetHeader>
          {editarAberto && a && <FormularioAssociacao registro={a} onFechar={() => setEditarAberto(false)} />}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}

// ─── Contatos ──────────────────────────────────────────────────────────────

const schemaContato = z
  .object({
    modo: z.enum(["existente", "nova"]),
    pessoa: z.custom<Pessoa | null>(),
    nome: z.string().trim().max(200, "No máximo 200 caracteres"),
    email: z.union([z.literal(""), z.email("E-mail inválido")]),
    telefone: z.string().trim().max(20, "Telefone inválido"),
    funcao: z.enum(["presidente", "contato", "outro"]),
    principal: z.boolean(),
    desde: z.string(),
    ate: z.string(),
  })
  .refine((v) => v.modo === "nova" || v.pessoa, { message: "Escolha a pessoa", path: ["pessoa"] })
  .refine((v) => v.modo === "existente" || v.nome, { message: "Informe o nome", path: ["nome"] })
  .refine((v) => !v.desde || !v.ate || v.ate >= v.desde, {
    message: "O fim não pode ser antes do início",
    path: ["ate"],
  });
type FormContato = z.infer<typeof schemaContato>;

function Contatos({ associacaoId, editavel }: { associacaoId: string; editavel: boolean }) {
  const queryClient = useQueryClient();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Contato | null>(null);
  const [remover, setRemover] = useState<Contato | null>(null);

  const contatos = useQuery({
    queryKey: ["associacoes", associacaoId, "contatos"],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Contato[]>>(`/associacoes/${associacaoId}/contatos`, { signal }),
  });
  const linhas = contatos.data?.data ?? [];
  const colunas = editavel ? 6 : 5;

  const removerMutation = useMutation({
    mutationFn: () => fetchData(`/associacoes/${associacaoId}/contatos/${remover!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Contato removido da associação.");
      setRemover(null);
      queryClient.invalidateQueries({ queryKey: ["associacoes", associacaoId, "contatos"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível remover o contato.")),
  });

  const confirmacao: Confirmacao | null = remover
    ? {
        titulo: `Remover ${remover.nome} dos contatos?`,
        descricao: "A pessoa deixa de ser contato desta associação, mas continua cadastrada no sistema.",
        textoConfirmar: "Remover",
        destrutivo: true,
        pendente: removerMutation.isPending,
        onConfirmar: () => removerMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="contatos-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="contatos-titulo" className="text-lg font-semibold">
            Contatos
          </h2>
          <p className="text-sm text-muted-foreground">Presidente e pessoas de referência da associação.</p>
        </div>
        {editavel && (
          <Button variant="outline" onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" /> Incluir contato
          </Button>
        )}
      </div>

      <div className="border" aria-busy={contatos.isPending}>
        <Table aria-label="Contatos da associação">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Função</TableHead>
              <TableHead className="hidden md:table-cell">Telefone</TableHead>
              <TableHead className="hidden lg:table-cell">E-mail</TableHead>
              <TableHead className="hidden lg:table-cell">Período</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contatos.isPending ? (
              <TableRow>
                <TableCell colSpan={colunas}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : contatos.isError ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  {ehSemPermissao(contatos.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os contatos.{" "}
                      <Button variant="link" size="sm" onClick={() => contatos.refetch()}>
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  Nenhum contato cadastrado
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex min-w-0 flex-col whitespace-normal">
                      <span className="inline-flex items-center gap-1 font-medium">
                        {c.nome}
                        {c.principal && (
                          <>
                            <Star className="size-3.5 fill-primary text-primary" aria-hidden />
                            <span className="sr-only">(contato principal)</span>
                          </>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground sm:hidden">
                        {rotuloFuncao(c.funcao)}
                      </span>
                      {c.telefone && (
                        <a
                          href={linkWhatsapp(c.telefone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline-offset-4 hover:underline md:hidden"
                        >
                          {telefone(c.telefone)}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{rotuloFuncao(c.funcao)}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {c.telefone ? (
                      <a
                        href={linkWhatsapp(c.telefone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir conversa no WhatsApp"
                        className="text-primary tabular-nums underline-offset-4 hover:underline"
                      >
                        {telefone(c.telefone)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="underline-offset-4 hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                    {c.desde ? dataCalendario(c.desde) : "—"}
                    {c.ate && ` a ${dataCalendario(c.ate)}`}
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Editar"
                          aria-label={`Editar o contato ${c.nome}`}
                          onClick={() => setEditar(c)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Remover"
                          aria-label={`Remover ${c.nome} dos contatos`}
                          onClick={() => setRemover(c)}
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
            <SheetTitle>Incluir contato</SheetTitle>
            <SheetDescription>
              Escolha alguém já cadastrado ou cadastre a pessoa agora. Contato novo não acessa o painel.
            </SheetDescription>
          </SheetHeader>
          {novoAberto && (
            <FormularioContato associacaoId={associacaoId} onFechar={() => setNovoAberto(false)} />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Contato: {editar?.nome}</SheetTitle>
            <SheetDescription>Função e período como contato desta associação.</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioContato
              key={editar.id}
              associacaoId={associacaoId}
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

function FormularioContato({
  associacaoId,
  registro,
  onFechar,
}: {
  associacaoId: string;
  registro?: Contato;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormContato>({
    resolver: zodResolver(schemaContato),
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
      funcao: registro?.funcao ?? "presidente",
      principal: registro?.principal ?? false,
      desde: registro?.desde ?? "",
      ate: registro?.ate ?? "",
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
    mutationFn: (d: FormContato) => {
      const vinculo = {
        funcao: d.funcao,
        principal: d.principal,
        desde: d.desde || null,
        ate: d.ate || null,
      };
      if (registro) {
        return fetchData(`/associacoes/${associacaoId}/contatos/${registro.id}`, {
          method: "PATCH",
          body: vinculo,
        });
      }
      const pessoa =
        d.modo === "existente"
          ? { userId: d.pessoa!.id }
          : { pessoa: { nome: d.nome, email: d.email || undefined, telefone: d.telefone || undefined } };
      return fetchData(`/associacoes/${associacaoId}/contatos`, {
        method: "POST",
        body: { ...pessoa, ...vinculo },
      });
    },
    onSuccess: () => {
      toast.success(registro ? "Contato atualizado." : "Contato incluído.");
      queryClient.invalidateQueries({ queryKey: ["associacoes", associacaoId, "contatos"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o contato."));
    },
  });

  const aria = (nome: keyof FormContato) => ({
    id: `contato-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `contato-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormContato) =>
    errors[nome] && (
      <p id={`contato-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
            <Label htmlFor="contato-pessoa">Buscar pessoa</Label>
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
              <Label htmlFor="contato-nome">Nome</Label>
              <Input maxLength={200} {...aria("nome")} {...register("nome")} />
              {erro("nome")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid content-start gap-1.5">
                <Label htmlFor="contato-email">E-mail (opcional)</Label>
                <Input type="email" {...aria("email")} {...register("email")} />
                {erro("email")}
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor="contato-telefone">Telefone (opcional)</Label>
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
          <Label htmlFor="contato-funcao">Função</Label>
          <NativeSelect className="w-full" {...aria("funcao")} {...register("funcao")}>
            {FUNCOES.map((f) => (
              <NativeSelectOption key={f.valor} value={f.valor}>
                {f.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="principal"
              render={({ field }) => (
                <Checkbox
                  id="contato-principal"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v)}
                />
              )}
            />
            <Label htmlFor="contato-principal">Contato principal</Label>
          </div>
          <p className="text-xs text-muted-foreground">Marcar este desmarca o contato principal anterior.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="contato-desde">Desde</Label>
            <Input type="date" {...aria("desde")} {...register("desde")} />
            {erro("desde")}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="contato-ate">Até</Label>
            <Input type="date" {...aria("ate")} {...register("ate")} />
            {erro("ate")}
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

// ─── Documentos ────────────────────────────────────────────────────────────

/** Uma linha do checklist: o tipo exigido e o documento registrado (ou ainda não). */
type LinhaDocumento = {
  chave: string;
  tipoId: string;
  nomeTipo: string;
  obrigatorio: boolean;
  porProjeto: boolean;
  documento: Documento | null;
};

const schemaDocumento = z.object({
  tipoDocumentoId: z.string().min(1, "Escolha o tipo de documento"),
  projetoId: z.string(),
  situacao: z.enum(["pendente", "recebido", "validado", "rejeitado"]),
  validade: z.string(),
  observacao: z.string().trim().max(2000, "No máximo 2000 caracteres"),
});
type FormDocumento = z.infer<typeof schemaDocumento>;

function Documentos({ associacaoId, editavel }: { associacaoId: string; editavel: boolean }) {
  const queryClient = useQueryClient();
  const chave = ["associacoes", associacaoId, "documentos"];
  // `tipoInicial` = "" abre o registro com o tipo em aberto; um id já o deixa escolhido
  const [registrar, setRegistrar] = useState<{ tipoInicial: string } | null>(null);
  const [editar, setEditar] = useState<Documento | null>(null);
  const [excluir, setExcluir] = useState<Documento | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const alvoUpload = useRef<string | null>(null);

  const tipos = useQuery({
    queryKey: ["tipos-documento", { ativo: true, limit: 200, sort: "ordem:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<TipoDocumento[], MetaPaginacao>>("/tipos-documento", {
        query: { ativo: true, limit: 200, sort: "ordem:asc" },
        signal,
      }),
  });
  const documentos = useQuery({
    queryKey: chave,
    queryFn: ({ signal }) =>
      fetchData<Envelope<Documento[]>>(`/associacoes/${associacaoId}/documentos`, { signal }),
  });
  const listaTipos = useMemo(() => tipos.data?.data ?? [], [tipos.data]);

  const linhas = useMemo<LinhaDocumento[]>(() => {
    const docs = documentos.data?.data ?? [];
    const resultado: LinhaDocumento[] = [];
    for (const t of listaTipos) {
      const base = { tipoId: t.id, nomeTipo: t.nome, obrigatorio: t.obrigatorio, porProjeto: t.porProjeto };
      const doTipo = docs.filter((d) => d.tipoDocumentoId === t.id);
      if (doTipo.length === 0) resultado.push({ ...base, chave: t.id, documento: null });
      for (const d of doTipo) resultado.push({ ...base, chave: d.id, documento: d });
    }
    // Documento de um tipo que saiu do catálogo continua visível no fim da lista
    const ativos = new Set(listaTipos.map((t) => t.id));
    for (const d of docs.filter((x) => !ativos.has(x.tipoDocumentoId))) {
      resultado.push({
        chave: d.id,
        tipoId: d.tipoDocumentoId,
        nomeTipo: d.tipoDocumento,
        obrigatorio: false,
        porProjeto: d.projetoId !== null,
        documento: d,
      });
    }
    return resultado;
  }, [listaTipos, documentos.data]);

  const enviar = useMutation({
    mutationFn: ({ documentoId, arquivo }: { documentoId: string; arquivo: File }) => {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      return fetchData(`/associacoes/${associacaoId}/documentos/${documentoId}/arquivo`, {
        method: "PUT",
        formData,
      });
    },
    onSuccess: () => {
      toast.success("Arquivo enviado.");
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível enviar o arquivo.")),
  });

  const excluirMutation = useMutation({
    mutationFn: () =>
      fetchData(`/associacoes/${associacaoId}/documentos/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Documento excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o documento.")),
  });

  const escolherArquivo = (documentoId: string) => {
    alvoUpload.current = documentoId;
    inputArquivo.current?.click();
  };

  const confirmacao: Confirmacao | null = excluir
    ? {
        titulo: `Excluir “${excluir.tipoDocumento}”${excluir.projetoSigla ? ` de ${excluir.projetoSigla}` : ""}?`,
        descricao: "O registro e o arquivo enviado deixam de aparecer no checklist da associação.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
      }
    : null;

  const carregando = tipos.isPending || documentos.isPending;
  const consultaComErro = tipos.isError ? tipos : documentos.isError ? documentos : null;

  return (
    <section aria-labelledby="documentos-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="documentos-titulo" className="text-lg font-semibold">
            Documentos
          </h2>
          <p className="text-sm text-muted-foreground">
            Checklist dos documentos exigidos. Alguns valem para todos os projetos; outros (como o termo de
            parceria) são um por projeto.
          </p>
        </div>
        {editavel && (
          <Button variant="outline" onClick={() => setRegistrar({ tipoInicial: "" })}>
            <Plus className="size-4" /> Registrar documento
          </Button>
        )}
      </div>

      {/* Um seletor de arquivo só para a seção; o botão de cada linha diz para qual documento */}
      <input
        ref={inputArquivo}
        type="file"
        accept={ACEITA_DOCUMENTO}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          const documentoId = alvoUpload.current;
          e.target.value = "";
          if (!arquivo || !documentoId) return;
          if (arquivo.size > MAX_ARQUIVO_BYTES) {
            toast.error("Arquivo muito grande. Tamanho máximo: 20 MB.");
            return;
          }
          enviar.mutate({ documentoId, arquivo });
        }}
      />

      <div className="border" aria-busy={carregando}>
        <Table aria-label="Documentos da associação">
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead className="hidden sm:table-cell">Projeto</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="hidden lg:table-cell">Validade</TableHead>
              <TableHead className="hidden md:table-cell">Arquivo</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : consultaComErro ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  {ehSemPermissao(consultaComErro.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os documentos.{" "}
                      <Button variant="link" size="sm" onClick={() => consultaComErro.refetch()}>
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhum tipo de documento cadastrado no catálogo
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => {
                const d = l.documento;
                const enviando = enviar.isPending && enviar.variables?.documentoId === d?.id;
                const rotulo = `${l.nomeTipo}${d?.projetoSigla ? ` (${d.projetoSigla})` : ""}`;
                return (
                  <TableRow key={l.chave}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col whitespace-normal">
                        <span className="font-medium">{l.nomeTipo}</span>
                        <span className="text-xs text-muted-foreground">
                          {l.obrigatorio ? "Obrigatório" : "Opcional"}
                          <span className="sm:hidden">
                            {d?.projetoSigla ? ` · ${d.projetoSigla}` : l.porProjeto ? " · por projeto" : ""}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {d?.projetoSigla ?? (
                        <span className="text-muted-foreground">
                          {l.porProjeto ? "Por projeto" : "Todos os projetos"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d ? (
                        <Badge variant={varianteSituacaoDoc(d.situacao)}>
                          {rotuloSituacaoDoc(d.situacao)}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Não registrado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                      {d?.validade ? dataCalendario(d.validade) : "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-48 text-sm md:table-cell">
                      {d?.temArquivo ? (
                        <a
                          href={`${env.API_URL}/associacoes/${associacaoId}/documentos/${d.id}/arquivo`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
                          title={d.nomeArquivo ?? undefined}
                        >
                          <Download className="size-3.5 shrink-0" />
                          <span className="truncate">{d.nomeArquivo ?? "Baixar"}</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {d?.temArquivo && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="md:hidden"
                            title="Baixar"
                            aria-label={`Baixar ${rotulo}`}
                            nativeButton={false}
                            render={
                              <a
                                href={`${env.API_URL}/associacoes/${associacaoId}/documentos/${d.id}/arquivo`}
                                target="_blank"
                                rel="noopener"
                              />
                            }
                          >
                            <Download className="size-4" />
                          </Button>
                        )}
                        {editavel && !d && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Registrar"
                            aria-label={`Registrar ${l.nomeTipo}`}
                            onClick={() => setRegistrar({ tipoInicial: l.tipoId })}
                          >
                            <Plus className="size-4" /> <span className="hidden sm:inline">Registrar</span>
                          </Button>
                        )}
                        {editavel && d && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={d.temArquivo ? "Substituir arquivo" : "Enviar arquivo"}
                              aria-label={`${d.temArquivo ? "Substituir o arquivo de" : "Enviar arquivo de"} ${rotulo}`}
                              disabled={enviar.isPending}
                              onClick={() => escolherArquivo(d.id)}
                            >
                              {enviando ? <Spinner /> : <Upload className="size-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Situação e validade"
                              aria-label={`Alterar a situação de ${rotulo}`}
                              onClick={() => setEditar(d)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Excluir"
                              aria-label={`Excluir ${rotulo}`}
                              onClick={() => setExcluir(d)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {enviar.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          Enviando arquivo…
        </p>
      )}

      <Sheet open={registrar !== null} onOpenChange={(aberto) => !aberto && setRegistrar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Registrar documento</SheetTitle>
            <SheetDescription>
              O documento entra no checklist; o arquivo é enviado depois, pelo botão de envio na linha.
            </SheetDescription>
          </SheetHeader>
          {registrar && (
            <FormularioDocumento
              associacaoId={associacaoId}
              tipos={listaTipos}
              tipoInicial={registrar.tipoInicial}
              onFechar={() => setRegistrar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>
              {editar?.tipoDocumento}
              {editar?.projetoSigla && ` — ${editar.projetoSigla}`}
            </SheetTitle>
            <SheetDescription>Situação da conferência, validade e observações.</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioDocumento
              key={editar.id}
              associacaoId={associacaoId}
              tipos={listaTipos}
              registro={editar}
              onFechar={() => setEditar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setExcluir(null)} />
    </section>
  );
}

function FormularioDocumento({
  associacaoId,
  tipos,
  tipoInicial = "",
  registro,
  onFechar,
}: {
  associacaoId: string;
  tipos: TipoDocumento[];
  tipoInicial?: string;
  registro?: Documento;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const projetos = useProjetos();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormDocumento>({
    resolver: zodResolver(schemaDocumento),
    defaultValues: {
      tipoDocumentoId: registro?.tipoDocumentoId ?? tipoInicial,
      projetoId: registro?.projetoId ?? projetos.unico ?? "",
      situacao: registro?.situacao ?? "pendente",
      validade: registro?.validade ?? "",
      observacao: registro?.observacao ?? "",
    },
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;
  const tipoId = useWatch({ control, name: "tipoDocumentoId" });
  const porProjeto = tipos.find((t) => t.id === tipoId)?.porProjeto ?? false;

  const salvar = useMutation({
    mutationFn: ({ tipoDocumentoId, projetoId, ...d }: FormDocumento) => {
      const campos = { situacao: d.situacao, validade: d.validade || null, observacao: d.observacao || null };
      return registro
        ? fetchData(`/associacoes/${associacaoId}/documentos/${registro.id}`, {
            method: "PATCH",
            body: campos,
          })
        : fetchData(`/associacoes/${associacaoId}/documentos`, {
            method: "POST",
            body: { tipoDocumentoId, projetoId: porProjeto ? projetoId : null, ...campos },
          });
    },
    onSuccess: () => {
      toast.success(registro ? "Documento atualizado." : "Documento registrado.");
      queryClient.invalidateQueries({ queryKey: ["associacoes", associacaoId, "documentos"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o documento."));
    },
  });

  const aria = (nome: keyof FormDocumento) => ({
    id: `documento-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `documento-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormDocumento) =>
    errors[nome] && (
      <p id={`documento-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message}
      </p>
    );

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((d) => {
        if (!registro && porProjeto && !d.projetoId) {
          setError(
            "projetoId",
            { message: "Este documento é por projeto — escolha o projeto" },
            { shouldFocus: true },
          );
          return;
        }
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
            <Label htmlFor="documento-tipoDocumentoId">Tipo de documento</Label>
            <NativeSelect className="w-full" {...aria("tipoDocumentoId")} {...register("tipoDocumentoId")}>
              <NativeSelectOption value="">Selecione…</NativeSelectOption>
              {tipos.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.nome}
                  {t.porProjeto ? " (por projeto)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {erro("tipoDocumentoId")}
          </div>
        )}

        {!registro && porProjeto && (
          <div className="grid gap-1.5">
            <Label htmlFor="documento-projetoId">Projeto</Label>
            <NativeSelect
              className="w-full"
              disabled={projetos.isPending}
              {...aria("projetoId")}
              {...register("projetoId")}
            >
              <NativeSelectOption value="">Selecione…</NativeSelectOption>
              {projetos.opcoes.map((p) => (
                <NativeSelectOption key={p.value} value={p.value}>
                  {p.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Só é aceito projeto de que a associação participa.
            </p>
            {erro("projetoId")}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="documento-situacao">Situação</Label>
            <NativeSelect className="w-full" {...aria("situacao")} {...register("situacao")}>
              {SITUACOES_DOC.map((s) => (
                <NativeSelectOption key={s.valor} value={s.valor}>
                  {s.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="documento-validade">Validade</Label>
            <Input type="date" {...aria("validade")} {...register("validade")} />
            {erro("validade")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="documento-observacao">Observação</Label>
          <Textarea
            placeholder="Ex.: falta a assinatura do presidente"
            {...aria("observacao")}
            {...register("observacao")}
          />
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

// ─── Diagnóstico ───────────────────────────────────────────────────────────

const resposta = z.enum(["", "sim", "nao", "parcialmente", "nao_sei"]);
const simOuNao = z.enum(["", "sim", "nao"]);
const schemaDiagnostico = z.object({
  coletadoEm: z.iso.date("Informe a data da coleta"),
  analiseSoloRecente: resposta,
  acessoMaquinario: resposta,
  praticasConservacao: z.string().trim().max(2000, "No máximo 2000 caracteres"),
  participouCursos: resposta,
  interesseCapacitacao: simOuNao,
  possuiRegistroFormal: simOuNao,
  possuiLocalEventos: simOuNao,
  tipoLocalEventos: z.string().trim().max(300, "No máximo 300 caracteres"),
  potencialNaoExplorado: z.string().trim().max(2000, "No máximo 2000 caracteres"),
  comentarios: z.string().trim().max(4000, "No máximo 4000 caracteres"),
  revisado: z.boolean(),
  /** ids das opções marcadas, de todos os grupos */
  opcoes: z.array(z.string()),
  /** texto do "Outro" (opções com `permiteDetalhe`), por id */
  detalhes: z.record(z.string(), z.string().trim().max(500, "No máximo 500 caracteres")),
});
type FormDiagnostico = z.infer<typeof schemaDiagnostico>;

const deSimNao = (v: "" | "sim" | "nao") => (v === "" ? null : v === "sim");
const paraSimNao = (v: boolean | null | undefined) => (v === true ? "sim" : v === false ? "nao" : "");
const hoje = () => new Date().toLocaleDateString("sv-SE");

function DiagnosticoSecao({ associacaoId, editavel }: { associacaoId: string; editavel: boolean }) {
  const [aberto, setAberto] = useState(false);
  const diagnostico = useQuery({
    queryKey: ["associacoes", associacaoId, "diagnostico"],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Diagnostico>>(`/associacoes/${associacaoId}/diagnostico`, { signal }),
  });
  const naoPreenchido = diagnostico.isError && (diagnostico.error as ErroApi).status === 404;
  const d = diagnostico.data?.data;

  const opcoesDo = (grupo: GrupoOpcao) => d?.opcoes.filter((o) => o.grupo === grupo) ?? [];
  const badges = (grupo: GrupoOpcao) => {
    const marcadas = opcoesDo(grupo);
    return marcadas.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className="flex flex-wrap gap-1">
        {marcadas.map((o) => (
          <Badge key={o.opcaoId} variant="secondary">
            {o.nome}
            {o.detalhe && `: ${o.detalhe}`}
          </Badge>
        ))}
      </span>
    );
  };
  const respostaLegivel = (v: keyof typeof RESPOSTAS | null) => (v ? RESPOSTAS[v] : "—");

  return (
    <section aria-labelledby="diagnostico-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="diagnostico-titulo" className="text-lg font-semibold">
            Diagnóstico
          </h2>
          <p className="text-sm text-muted-foreground">
            Levantamento inicial da associação, reaproveitado por todos os projetos.
          </p>
        </div>
        {editavel && d && (
          <Button variant="outline" onClick={() => setAberto(true)}>
            <Pencil className="size-4" /> Atualizar diagnóstico
          </Button>
        )}
      </div>

      <div className="border p-4" aria-busy={diagnostico.isPending}>
        {diagnostico.isPending ? (
          <div className="grid gap-2">
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : naoPreenchido ? (
          <EmptyState
            className="py-6"
            title="Diagnóstico ainda não preenchido"
            description="Registre o levantamento feito na visita inicial à associação."
            action={
              editavel && (
                <Button onClick={() => setAberto(true)}>
                  <Plus className="size-4" /> Preencher diagnóstico
                </Button>
              )
            }
          />
        ) : diagnostico.isError ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {ehSemPermissao(diagnostico.error) ? (
              "Você não tem permissão para ver isto."
            ) : (
              <>
                Erro ao carregar o diagnóstico.{" "}
                <Button variant="link" size="sm" onClick={() => diagnostico.refetch()}>
                  Tentar novamente
                </Button>
              </>
            )}
          </p>
        ) : (
          d && (
            <div className="grid gap-5 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                Coletado em{" "}
                <span className="text-foreground tabular-nums">{dataCalendario(d.coletadoEm)}</span>
                {d.revisado ? <Badge>Revisado</Badge> : <Badge variant="secondary">Não revisado</Badge>}
              </p>

              <BlocoDiagnostico titulo="Solo">
                <ItemDiagnostico rotulo="Análise de solo recente">
                  {respostaLegivel(d.analiseSoloRecente)}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo="Acesso a maquinário">
                  {respostaLegivel(d.acessoMaquinario)}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo="Práticas de conservação" largo>
                  {d.praticasConservacao ?? "—"}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo={GRUPOS.problema_solo} largo>
                  {badges("problema_solo")}
                </ItemDiagnostico>
              </BlocoDiagnostico>

              <BlocoDiagnostico titulo="Produção">
                <ItemDiagnostico rotulo={GRUPOS.atividade_produtiva} largo>
                  {badges("atividade_produtiva")}
                </ItemDiagnostico>
              </BlocoDiagnostico>

              <BlocoDiagnostico titulo="Capacitação">
                <ItemDiagnostico rotulo="Já participou de cursos">
                  {respostaLegivel(d.participouCursos)}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo="Interesse em capacitação">
                  {simNao(d.interesseCapacitacao)}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo={GRUPOS.tema_capacitacao} largo>
                  {badges("tema_capacitacao")}
                </ItemDiagnostico>
              </BlocoDiagnostico>

              <BlocoDiagnostico titulo="Organização e apoio">
                <ItemDiagnostico rotulo="Registro formal">{simNao(d.possuiRegistroFormal)}</ItemDiagnostico>
                <ItemDiagnostico rotulo="Local para eventos">
                  {simNao(d.possuiLocalEventos)}
                  {d.tipoLocalEventos && (
                    <span className="text-muted-foreground"> · {d.tipoLocalEventos}</span>
                  )}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo={GRUPOS.parceiro_institucional} largo>
                  {badges("parceiro_institucional")}
                </ItemDiagnostico>
                <ItemDiagnostico rotulo={GRUPOS.apoio_necessario} largo>
                  {badges("apoio_necessario")}
                </ItemDiagnostico>
              </BlocoDiagnostico>

              <BlocoDiagnostico titulo="Observações">
                <ItemDiagnostico rotulo="Potencial não explorado" largo>
                  <span className="whitespace-pre-line">{d.potencialNaoExplorado ?? "—"}</span>
                </ItemDiagnostico>
                <ItemDiagnostico rotulo="Comentários" largo>
                  <span className="whitespace-pre-line">{d.comentarios ?? "—"}</span>
                </ItemDiagnostico>
              </BlocoDiagnostico>
            </div>
          )
        )}
      </div>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>Diagnóstico da associação</SheetTitle>
            <SheetDescription>
              Salvar substitui as respostas atuais; as versões anteriores ficam no histórico.
            </SheetDescription>
          </SheetHeader>
          {aberto && (
            <FormularioDiagnostico
              associacaoId={associacaoId}
              registro={d}
              onFechar={() => setAberto(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function BlocoDiagnostico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function ItemDiagnostico({
  rotulo,
  largo,
  children,
}: {
  rotulo: string;
  largo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function FormularioDiagnostico({
  associacaoId,
  registro,
  onFechar,
}: {
  associacaoId: string;
  registro?: Diagnostico;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const catalogo = useQuery({
    queryKey: ["opcoes-diagnostico", { ativo: true, limit: 200, sort: "ordem:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<OpcaoDiagnostico[], MetaPaginacao>>("/opcoes-diagnostico", {
        query: { ativo: true, limit: 200, sort: "ordem:asc" },
        signal,
      }),
  });
  const opcoes = useMemo(() => catalogo.data?.data ?? [], [catalogo.data]);

  const form = useForm<FormDiagnostico>({
    resolver: zodResolver(schemaDiagnostico),
    defaultValues: {
      coletadoEm: registro?.coletadoEm.slice(0, 10) ?? hoje(),
      analiseSoloRecente: registro?.analiseSoloRecente ?? "",
      acessoMaquinario: registro?.acessoMaquinario ?? "",
      praticasConservacao: registro?.praticasConservacao ?? "",
      participouCursos: registro?.participouCursos ?? "",
      interesseCapacitacao: paraSimNao(registro?.interesseCapacitacao),
      possuiRegistroFormal: paraSimNao(registro?.possuiRegistroFormal),
      possuiLocalEventos: paraSimNao(registro?.possuiLocalEventos),
      tipoLocalEventos: registro?.tipoLocalEventos ?? "",
      potencialNaoExplorado: registro?.potencialNaoExplorado ?? "",
      comentarios: registro?.comentarios ?? "",
      revisado: registro?.revisado ?? false,
      opcoes: registro?.opcoes.map((o) => o.opcaoId) ?? [],
      detalhes: Object.fromEntries((registro?.opcoes ?? []).map((o) => [o.opcaoId, o.detalhe ?? ""])),
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const localEventos = useWatch({ control, name: "possuiLocalEventos" });

  const salvar = useMutation({
    mutationFn: (v: FormDiagnostico) => {
      // Só vão as opções que ainda existem no catálogo (as inativas a API recusaria)
      const ativas = new Set(opcoes.map((o) => o.id));
      const body = {
        coletadoEm: v.coletadoEm,
        analiseSoloRecente: v.analiseSoloRecente || null,
        acessoMaquinario: v.acessoMaquinario || null,
        praticasConservacao: v.praticasConservacao || null,
        participouCursos: v.participouCursos || null,
        interesseCapacitacao: deSimNao(v.interesseCapacitacao),
        possuiRegistroFormal: deSimNao(v.possuiRegistroFormal),
        possuiLocalEventos: deSimNao(v.possuiLocalEventos),
        tipoLocalEventos: v.possuiLocalEventos === "sim" ? v.tipoLocalEventos || null : null,
        potencialNaoExplorado: v.potencialNaoExplorado || null,
        comentarios: v.comentarios || null,
        revisado: v.revisado,
        opcoes: v.opcoes
          .filter((opcaoId) => ativas.has(opcaoId))
          .map((opcaoId) => ({ opcaoId, detalhe: v.detalhes[opcaoId]?.trim() || null })),
      };
      return fetchData(`/associacoes/${associacaoId}/diagnostico`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success("Diagnóstico salvo.");
      queryClient.invalidateQueries({ queryKey: ["associacoes", associacaoId, "diagnostico"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o diagnóstico."));
    },
  });

  const aria = (nome: keyof FormDiagnostico) => ({
    id: `diagnostico-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `diagnostico-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormDiagnostico) =>
    errors[nome] && (
      <p id={`diagnostico-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message as string}
      </p>
    );
  const selectResposta = (nome: "analiseSoloRecente" | "acessoMaquinario" | "participouCursos") => (
    <NativeSelect className="w-full" {...aria(nome)} {...register(nome)}>
      <NativeSelectOption value="">Não informado</NativeSelectOption>
      {Object.entries(RESPOSTAS).map(([valor, rotulo]) => (
        <NativeSelectOption key={valor} value={valor}>
          {rotulo}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
  const selectSimNao = (nome: "interesseCapacitacao" | "possuiRegistroFormal" | "possuiLocalEventos") => (
    <NativeSelect className="w-full" {...aria(nome)} {...register(nome)}>
      <NativeSelectOption value="">Não informado</NativeSelectOption>
      <NativeSelectOption value="sim">Sim</NativeSelectOption>
      <NativeSelectOption value="nao">Não</NativeSelectOption>
    </NativeSelect>
  );
  const grupo = (g: GrupoOpcao) => (
    <GrupoOpcoes
      titulo={GRUPOS[g]}
      opcoes={opcoes.filter((o) => o.grupo === g)}
      carregando={catalogo.isPending}
      control={control}
      register={register}
      erroDetalhe={(id) => errors.detalhes?.[id]?.message}
    />
  );

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((v) => {
        setErrosApi([]);
        salvar.mutate(v);
      })}
    >
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {errosApi.length > 0 && (
          <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
            {errosApi.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {catalogo.isError && (
          <p role="alert" className="text-xs text-destructive">
            Não foi possível carregar as opções de múltipla escolha.{" "}
            <Button type="button" variant="link" size="sm" onClick={() => catalogo.refetch()}>
              Tentar novamente
            </Button>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="diagnostico-coletadoEm">Data da coleta</Label>
            <Input type="date" {...aria("coletadoEm")} {...register("coletadoEm")} />
            {erro("coletadoEm")}
          </div>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Solo</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="diagnostico-analiseSoloRecente">Fez análise de solo recente?</Label>
              {selectResposta("analiseSoloRecente")}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="diagnostico-acessoMaquinario">Tem acesso a maquinário?</Label>
              {selectResposta("acessoMaquinario")}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diagnostico-praticasConservacao">Práticas de conservação do solo</Label>
            <Textarea
              placeholder="Plantio direto, curva de nível, adubação verde…"
              {...aria("praticasConservacao")}
              {...register("praticasConservacao")}
            />
            {erro("praticasConservacao")}
          </div>
          {grupo("problema_solo")}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Produção</legend>
          {grupo("atividade_produtiva")}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Capacitação</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="diagnostico-participouCursos">Já participou de cursos?</Label>
              {selectResposta("participouCursos")}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="diagnostico-interesseCapacitacao">Tem interesse em capacitação?</Label>
              {selectSimNao("interesseCapacitacao")}
            </div>
          </div>
          {grupo("tema_capacitacao")}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Organização e apoio</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="diagnostico-possuiRegistroFormal">Possui registro formal?</Label>
              {selectSimNao("possuiRegistroFormal")}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="diagnostico-possuiLocalEventos">Tem local para eventos?</Label>
              {selectSimNao("possuiLocalEventos")}
            </div>
          </div>
          {localEventos === "sim" && (
            <div className="grid gap-1.5">
              <Label htmlFor="diagnostico-tipoLocalEventos">Que tipo de local?</Label>
              <Input
                placeholder="Barracão, sede, escola…"
                maxLength={300}
                {...aria("tipoLocalEventos")}
                {...register("tipoLocalEventos")}
              />
              {erro("tipoLocalEventos")}
            </div>
          )}
          {grupo("parceiro_institucional")}
          {grupo("apoio_necessario")}
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Observações</legend>
          <div className="grid gap-1.5">
            <Label htmlFor="diagnostico-potencialNaoExplorado">Potencial não explorado</Label>
            <Textarea {...aria("potencialNaoExplorado")} {...register("potencialNaoExplorado")} />
            {erro("potencialNaoExplorado")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diagnostico-comentarios">Comentários</Label>
            <Textarea {...aria("comentarios")} {...register("comentarios")} />
            {erro("comentarios")}
          </div>
        </fieldset>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="revisado"
            render={({ field }) => (
              <Checkbox
                id="diagnostico-revisado"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v)}
              />
            )}
          />
          <Label htmlFor="diagnostico-revisado">Respostas revisadas</Label>
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending || catalogo.isPending}>
          {salvar.isPending ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : (
            "Salvar diagnóstico"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Checkboxes de um grupo do catálogo; a opção "Outro" (permiteDetalhe) abre um campo de texto. */
function GrupoOpcoes({
  titulo,
  opcoes,
  carregando,
  control,
  register,
  erroDetalhe,
}: {
  titulo: string;
  opcoes: OpcaoDiagnostico[];
  carregando: boolean;
  control: Control<FormDiagnostico>;
  register: UseFormRegister<FormDiagnostico>;
  erroDetalhe: (opcaoId: string) => string | undefined;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm">{titulo}</legend>
      {carregando ? (
        <Skeleton className="h-4 w-2/3" />
      ) : opcoes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma opção cadastrada no catálogo.</p>
      ) : (
        <Controller
          control={control}
          name="opcoes"
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {opcoes.map((o) => {
                const marcada = field.value.includes(o.id);
                const idCampo = `opcao-${o.id}`;
                const mensagem = erroDetalhe(o.id);
                return (
                  <div
                    key={o.id}
                    className={o.permiteDetalhe && marcada ? "grid gap-1.5 sm:col-span-2" : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={idCampo}
                        checked={marcada}
                        onCheckedChange={(v) =>
                          field.onChange(v ? [...field.value, o.id] : field.value.filter((x) => x !== o.id))
                        }
                      />
                      <Label htmlFor={idCampo} className="font-normal">
                        {o.nome}
                      </Label>
                    </div>
                    {o.permiteDetalhe && marcada && (
                      <>
                        <Input
                          aria-label={`${titulo}: especifique “${o.nome}”`}
                          placeholder="Especifique…"
                          maxLength={500}
                          aria-invalid={!!mensagem}
                          aria-describedby={mensagem ? `${idCampo}-erro` : undefined}
                          {...register(`detalhes.${o.id}`)}
                        />
                        {mensagem && (
                          <p id={`${idCampo}-erro`} role="alert" className="text-xs text-destructive">
                            {mensagem}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        />
      )}
    </fieldset>
  );
}
