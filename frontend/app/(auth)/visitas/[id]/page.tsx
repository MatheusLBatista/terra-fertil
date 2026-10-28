"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  ClipboardCheck,
  Download,
  FileText,
  PackageCheck,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  Upload,
  Users,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { env } from "@/lib/env";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { dataCalendario, dataHora, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import { rotuloCategoriaItem } from "@/lib/itens";
import {
  CartaoAssinatura,
  IconeAssinar,
  ModalAssinatura,
  useAssinatura,
  type PapelAssinante,
} from "@/components/assinatura";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Visita = components["schemas"]["Visita"];
type VisitaMembro = components["schemas"]["VisitaMembro"];
type VisitaAnexo = components["schemas"]["VisitaAnexo"];
type Membro = components["schemas"]["MembroEquipe"];
type Diagnostico = components["schemas"]["DiagnosticoPropriedade"];
type OpcaoDiagnostico = components["schemas"]["OpcaoDiagnostico"];
type Recomendacao = components["schemas"]["Recomendacao"];
type Entrega = components["schemas"]["Entrega"];
type ItemVerificado = components["schemas"]["VisitaItemVerificado"];
type AtividadesDaVisita = components["schemas"]["VisitaAtividades"];
type LinhaAtividade = AtividadesDaVisita["linhas"][number];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];
type TipoVisita = Visita["tipo"];
type Categoria = Recomendacao["categoria"];
type SituacaoRecomendacao = Recomendacao["situacao"];
type Resposta = NonNullable<Diagnostico["analiseSoloRecente"]>;

/** Teto do `limit` da API — sub-listas da visita vêm inteiras. */
const LIMITE = 200;
/** Mesmo teto do backend (MAX_UPLOAD_BYTES). */
const MAX_ARQUIVO = 20 * 1024 * 1024;
/**
 * Os tipos que a API aceita (DOC_MIME_TYPES). Listar explicitamente, sem HEIC, faz o
 * Safari do iPhone converter a foto para JPEG na hora de escolher — com `image/*` ela
 * pode ir em HEIC, que a API recusa e o Chrome não mostra na prévia.
 */
const TIPOS_ANEXO = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
/** Fotos de item verificado: só as imagens da lista acima. */
const TIPOS_FOTO = TIPOS_ANEXO.filter((t) => t.startsWith("image/"));
/** HEIC vindo do computador (o Chrome às vezes nem informa o tipo — por isso a extensão). */
const ehHeic = (f: File) => /^image\/hei[cf]/.test(f.type) || /\.hei[cf]$/i.test(f.name);

const TIPOS: Record<TipoVisita, string> = {
  inicial_associacao: "Visita inicial na associação",
  diagnostico_propriedade: "Diagnóstico na propriedade",
  assistencia_tecnica: "Assistência técnica",
  acompanhamento: "Acompanhamento",
};
const SITUACOES_VISITA: Record<Visita["situacao"], string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
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
const SITUACOES_RECOMENDACAO: { valor: SituacaoRecomendacao; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "adotada", rotulo: "Adotada" },
  { valor: "nao_adotada", rotulo: "Não adotada" },
];
const rotuloSituacaoRec = (s: SituacaoRecomendacao) =>
  SITUACOES_RECOMENDACAO.find((x) => x.valor === s)?.rotulo ?? s;
const varianteSituacaoRec = (s: SituacaoRecomendacao) =>
  s === "adotada" ? "default" : s === "nao_adotada" ? "destructive" : "secondary";
const RESPOSTAS: { valor: Resposta; rotulo: string }[] = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "parcialmente", rotulo: "Parcialmente" },
  { valor: "nao_sei", rotulo: "Não sabe" },
];
const rotuloResposta = (r: Resposta | null) =>
  r ? (RESPOSTAS.find((x) => x.valor === r)?.rotulo ?? r) : "—";
const GRUPOS_DIAGNOSTICO = [
  { grupo: "atividade_produtiva", rotulo: "Atividades produtivas" },
  { grupo: "problema_solo", rotulo: "Problemas de solo" },
] as const;

/** 1536000 → "1,5 MB". */
function tamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
const simNao = (v: boolean | null) => (v === null ? "—" : v ? "Sim" : "Não");
const urlArquivo = (visitaId: string, anexoId: string) =>
  `${env.API_URL}/visitas/${visitaId}/anexos/${anexoId}/arquivo`;
/** Acompanhamento na associação: confere os itens fornecidos (reunião de 23/10). */
const conferaItens = (v: Visita) => v.tipo === "acompanhamento" && !!v.associacaoId;
const consultaAtividades = (visitaId: string) => ({
  queryKey: ["visitas", visitaId, "atividades"],
  queryFn: ({ signal }: { signal?: AbortSignal }) =>
    fetchData<Envelope<AtividadesDaVisita>>(`/visitas/${visitaId}/atividades`, { signal }),
});
/** "Pecuária leiteira — Ordenha" ou só a atividade. */
const nomeAtividade = (l: { atividade: string; subdivisao: string | null }) =>
  l.subdivisao ? `${l.atividade} — ${l.subdivisao}` : l.atividade;
const consultaItensVerificados = (visitaId: string) => ({
  queryKey: ["visitas", visitaId, "itens-verificados"],
  queryFn: ({ signal }: { signal?: AbortSignal }) =>
    fetchData<Envelope<ItemVerificado[]>>(`/visitas/${visitaId}/itens-verificados`, { signal }),
});

export default function VisitaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { podeEditarCampo } = usePapel();

  const visita = useQuery({
    queryKey: ["visitas", id],
    queryFn: ({ signal }) => fetchData<Envelope<Visita>>(`/visitas/${id}`, { signal }),
  });
  const v = visita.data?.data;
  const assinavel = !!v && (conferaItens(v) || (v.tipo === "assistencia_tecnica" && !!v.propriedadeId));
  const assinatura = useAssinatura(`/visitas/${id}`, ["visitas", id, "assinatura"], assinavel);
  // Assinada, o que foi verificado (e as fotos disso) fica travado — a API recusa com 409
  const assinada = !!assinatura.data?.data;

  if (visita.isError) {
    return (
      <PageLayout title="Visita">
        <EmptyState
          title={
            ehSemPermissao(visita.error) ? "Você não tem permissão para ver isto." : "Visita não encontrada"
          }
          description="Ela pode ter sido excluída, ou você não faz parte da equipe do projeto dela."
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/visitas" />}>
              <ArrowLeft className="size-4" /> Voltar para visitas
            </Button>
          }
        />
      </PageLayout>
    );
  }

  const onde =
    v &&
    (v.associacaoId
      ? (v.associacaoSigla ?? "—")
      : `${[v.produtorNome, v.propriedadeNome].filter(Boolean).join(" — ")}${v.associacaoSigla ? ` (${v.associacaoSigla})` : ""}`);

  return (
    <PageLayout
      title={v ? TIPOS[v.tipo] : "Visita"}
      breadcrumb="Visita"
      titleExtra={
        v && (
          <Badge
            variant={
              v.situacao === "realizada"
                ? "default"
                : v.situacao === "cancelada"
                  ? "destructive"
                  : "secondary"
            }
          >
            {SITUACOES_VISITA[v.situacao]}
          </Badge>
        )
      }
      actions={
        <Button variant="outline" nativeButton={false} render={<Link href="/visitas" />}>
          <ArrowLeft className="size-4" /> Visitas
        </Button>
      }
    >
      <section aria-labelledby="dados-titulo" className="border p-4">
        <h2 id="dados-titulo" className="sr-only">
          Dados da visita
        </h2>
        {visita.isPending ? (
          <div className="grid gap-2" aria-busy>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          v && (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Onde</dt>
                <dd className="font-medium">{onde}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Projeto</dt>
                <dd>{v.projetoSigla}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Técnico responsável</dt>
                <dd>{v.tecnicoNome}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Data</dt>
                <dd className="tabular-nums">{dataCalendario(v.data)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Realizada em</dt>
                <dd className="tabular-nums">{dataHora(v.realizadaEm)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Coordenadas</dt>
                <dd className="tabular-nums">
                  {v.latitude !== null && v.longitude !== null ? `${v.latitude}, ${v.longitude}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Visita anterior</dt>
                <dd>
                  {v.visitaAnteriorId ? (
                    <Link
                      href={`/visitas/${v.visitaAnteriorId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Abrir visita de origem
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {v.noticiaUrl && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-muted-foreground">Notícia</dt>
                  <dd className="truncate">
                    <a
                      href={v.noticiaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {v.noticiaUrl}
                    </a>
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-muted-foreground">Relato</dt>
                <dd className="whitespace-pre-line">{v.relato || "—"}</dd>
              </div>
            </dl>
          )
        )}
      </section>

      {v && (
        <>
          <EquipeVisita visita={v} editavel={podeEditarCampo} />
          {conferaItens(v) && <ItensVerificados visita={v} editavel={podeEditarCampo && !assinada} />}
          {v.tipo === "assistencia_tecnica" && v.propriedadeId && (
            <AtividadesVerificadas visita={v} editavel={podeEditarCampo && !assinada} />
          )}
          {assinavel && <AssinaturaVisita visita={v} editavel={podeEditarCampo} />}
          <Anexos
            visitaId={v.id}
            editavel={podeEditarCampo}
            assinada={assinada}
            comItens={conferaItens(v)}
            comAtividades={v.tipo === "assistencia_tecnica" && !!v.propriedadeId}
          />
          {v.tipo === "diagnostico_propriedade" && (
            <DiagnosticoSecao visitaId={v.id} editavel={podeEditarCampo} />
          )}
          {v.tipo === "assistencia_tecnica" && (
            <RecomendacoesDaVisita visitaId={v.id} editavel={podeEditarCampo} />
          )}
          {v.tipo === "acompanhamento" && v.propriedadeId && (
            <Verificacoes visita={v} propriedadeId={v.propriedadeId} editavel={podeEditarCampo} />
          )}
        </>
      )}
    </PageLayout>
  );
}

function Cabecalho({
  id,
  titulo,
  descricao,
  acao,
}: {
  id: string;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}

function ErrosApi({ erros }: { erros: string[] }) {
  if (erros.length === 0) return null;
  return (
    <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
      {erros.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

/** Regra de negócio (409/422) e 400 sem campo ficam no bloco do formulário; o resto vira toast. */
function erroNoBloco(erro: unknown, padrao: string, setErros: (e: string[]) => void) {
  const status = (erro as Partial<ErroApi>).status;
  if (
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 413 ||
    status === 415 ||
    status === 422
  ) {
    setErros(
      (erro as Partial<ErroApi>).erros?.length ? (erro as ErroApi).erros! : [mensagemDeErro(erro, padrao)],
    );
  } else {
    toast.error(mensagemDeErro(erro, padrao));
  }
}

function RodapeForm({
  pendente,
  onFechar,
  texto,
}: {
  pendente: boolean;
  onFechar: () => void;
  texto: string;
}) {
  return (
    <SheetFooter className="flex-row justify-end gap-2 border-t">
      <Button type="button" variant="outline" onClick={onFechar}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pendente}>
        {pendente ? (
          <>
            <Spinner /> Salvando…
          </>
        ) : (
          texto
        )}
      </Button>
    </SheetFooter>
  );
}

// ─── Equipe da visita ──────────────────────────────────────────────────────

function EquipeVisita({ visita, editavel }: { visita: Visita; editavel: boolean }) {
  const [aberto, setAberto] = useState(false);
  const equipe = useQuery({
    queryKey: ["visitas", visita.id, "equipe"],
    queryFn: ({ signal }) => fetchData<Envelope<VisitaMembro[]>>(`/visitas/${visita.id}/equipe`, { signal }),
  });
  const membros = equipe.data?.data ?? [];

  return (
    <section aria-labelledby="equipe-titulo" className="space-y-3">
      <Cabecalho
        id="equipe-titulo"
        titulo="Equipe da visita"
        descricao="Quem foi a campo além do técnico responsável."
        acao={
          editavel && (
            <Button variant="outline" onClick={() => setAberto(true)} disabled={equipe.isPending}>
              <Users className="size-4" /> Editar equipe
            </Button>
          )
        }
      />
      <div className="border p-4 text-sm" aria-busy={equipe.isPending}>
        {equipe.isPending ? (
          <>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-4 w-1/2" />
          </>
        ) : equipe.isError ? (
          <p className="text-muted-foreground">
            Erro ao carregar a equipe.{" "}
            <Button variant="link" size="sm" onClick={() => equipe.refetch()}>
              Tentar novamente
            </Button>
          </p>
        ) : (
          <ul className="grid gap-2">
            <li className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{visita.tecnicoNome}</span>
              <Badge variant="secondary">Responsável</Badge>
            </li>
            {membros.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                <span>{m.nome}</span>
                {m.email && <span className="text-xs text-muted-foreground">{m.email}</span>}
              </li>
            ))}
            {membros.length === 0 && <li className="text-muted-foreground">Ninguém mais registrado</li>}
          </ul>
        )}
      </div>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Equipe da visita</SheetTitle>
            <SheetDescription>Marque quem da equipe do projeto foi a esta visita.</SheetDescription>
          </SheetHeader>
          {aberto && equipe.data && (
            <FormularioEquipe visita={visita} atuais={equipe.data.data} onFechar={() => setAberto(false)} />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function FormularioEquipe({
  visita,
  atuais,
  onFechar,
}: {
  visita: Visita;
  atuais: VisitaMembro[];
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [marcados, setMarcados] = useState<string[]>(() => atuais.map((m) => m.userId));
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const equipeProjeto = useQuery({
    queryKey: ["projetos", visita.projetoId, "equipe"],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Membro[]>>(`/projetos/${visita.projetoId}/equipe`, { signal }),
  });
  const pessoas = useMemo(() => {
    const lista = (equipeProjeto.data?.data ?? [])
      .filter((m) => m.userId !== visita.tecnicoId)
      .map((m) => ({ userId: m.userId, nome: m.nome, detalhe: m.desligadoEm ? "desligado(a)" : null }));
    // Quem já está na visita e saiu da equipe do projeto continua visível para poder desmarcar
    for (const a of atuais) {
      if (!lista.some((p) => p.userId === a.userId))
        lista.push({ userId: a.userId, nome: a.nome, detalhe: null });
    }
    return lista;
  }, [equipeProjeto.data, atuais, visita.tecnicoId]);

  const salvar = useMutation({
    mutationFn: () =>
      fetchData(`/visitas/${visita.id}/equipe`, { method: "PUT", body: { userIds: marcados } }),
    onSuccess: () => {
      toast.success("Equipe da visita atualizada.");
      queryClient.invalidateQueries({ queryKey: ["visitas", visita.id, "equipe"] });
      onFechar();
    },
    onError: (erro) => erroNoBloco(erro, "Não foi possível salvar a equipe.", setErrosApi),
  });

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setErrosApi([]);
        salvar.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <ErrosApi erros={errosApi} />
        <p className="text-sm text-muted-foreground">
          {visita.tecnicoNome} é o responsável e já conta na visita.
        </p>
        {equipeProjeto.isPending ? (
          <>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </>
        ) : equipeProjeto.isError ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar a equipe do projeto.</p>
        ) : pessoas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém mais na equipe do projeto.</p>
        ) : (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">Equipe do projeto</legend>
            {pessoas.map((p) => (
              <div key={p.userId} className="flex items-center gap-2">
                <Checkbox
                  id={`equipe-${p.userId}`}
                  checked={marcados.includes(p.userId)}
                  onCheckedChange={(marcado) =>
                    setMarcados((atual) =>
                      marcado ? [...atual, p.userId] : atual.filter((u) => u !== p.userId),
                    )
                  }
                />
                <Label htmlFor={`equipe-${p.userId}`} className="font-normal">
                  {p.nome}
                  {p.detalhe && <span className="text-xs text-muted-foreground"> ({p.detalhe})</span>}
                </Label>
              </div>
            ))}
          </fieldset>
        )}
      </div>
      <RodapeForm pendente={salvar.isPending} onFechar={onFechar} texto="Salvar" />
    </form>
  );
}

// ─── Fotos e documentos ────────────────────────────────────────────────────

function Anexos({
  visitaId,
  editavel,
  comItens,
  comAtividades,
  assinada,
}: {
  visitaId: string;
  editavel: boolean;
  /** Visita assinada: as fotos de item/atividade verificada não podem ser excluídas. */
  assinada: boolean;
  /** Acompanhamento na associação: mostra de qual item verificado é cada foto. */
  comItens: boolean;
  /** Assistência técnica: mostra de qual atividade verificada é cada foto. */
  comAtividades: boolean;
}) {
  const queryClient = useQueryClient();
  const [enviarAberto, setEnviarAberto] = useState(false);
  const [excluir, setExcluir] = useState<VisitaAnexo | null>(null);
  const itens = useQuery({ ...consultaItensVerificados(visitaId), enabled: comItens });
  const atividades = useQuery({ ...consultaAtividades(visitaId), enabled: comAtividades });
  const vinculo = (a: VisitaAnexo) => {
    if (a.entregaId) {
      const item = itens.data?.data.find((i) => i.entregaId === a.entregaId);
      return item && `Item verificado: ${item.itemDescricao}`;
    }
    if (a.atividadeVerificadaId) {
      const linha = atividades.data?.data.linhas.find((l) => l.verificacao?.id === a.atividadeVerificadaId);
      return linha && `Atividade verificada: ${nomeAtividade(linha)}`;
    }
  };

  const anexos = useQuery({
    queryKey: ["visitas", visitaId, "anexos"],
    queryFn: ({ signal }) => fetchData<Envelope<VisitaAnexo[]>>(`/visitas/${visitaId}/anexos`, { signal }),
  });
  const lista = anexos.data?.data ?? [];

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/visitas/${visitaId}/anexos/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Arquivo excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["visitas", visitaId, "anexos"] });
      queryClient.invalidateQueries({ queryKey: ["visitas", visitaId, "itens-verificados"] });
      queryClient.invalidateQueries({ queryKey: ["visitas", visitaId, "atividades"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o arquivo.")),
  });

  const confirmacao: Confirmacao | null = excluir
    ? {
        titulo: `Excluir “${excluir.legenda || excluir.nomeArquivo}”?`,
        descricao: "O arquivo deixa de aparecer nesta visita.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="anexos-titulo" className="space-y-3">
      <Cabecalho
        id="anexos-titulo"
        titulo="Fotos e documentos"
        descricao="Imagens ou PDF de até 20 MB."
        acao={
          editavel && (
            <Button variant="outline" onClick={() => setEnviarAberto(true)}>
              <Upload className="size-4" /> Enviar arquivo
            </Button>
          )
        }
      />

      {anexos.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          <span role="status" className="sr-only">
            Carregando…
          </span>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="hidden h-40 w-full sm:block" />
        </div>
      ) : anexos.isError ? (
        <p className="border py-6 text-center text-sm text-muted-foreground">
          {ehSemPermissao(anexos.error) ? (
            "Você não tem permissão para ver isto."
          ) : (
            <>
              Erro ao carregar os arquivos.{" "}
              <Button variant="link" size="sm" onClick={() => anexos.refetch()}>
                Tentar novamente
              </Button>
            </>
          )}
        </p>
      ) : lista.length === 0 ? (
        <p className="border py-6 text-center text-sm text-muted-foreground">Nenhum arquivo enviado</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Arquivos da visita">
          {lista.map((a) => {
            const nome = a.legenda || a.nomeArquivo;
            return (
              <li key={a.id} className="flex flex-col border">
                {a.tipo === "foto" ? (
                  <Miniatura visitaId={visitaId} anexo={a} />
                ) : (
                  <div className="flex h-40 items-center justify-center bg-muted/40 text-muted-foreground">
                    <FileText className="size-10" strokeWidth={1.5} aria-hidden />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                  <span className="line-clamp-2 font-medium">{nome}</span>
                  {vinculo(a) && <span className="line-clamp-2 text-xs">{vinculo(a)}</span>}
                  <span className="truncate text-xs text-muted-foreground">
                    {a.tipo === "foto" ? "Foto" : a.tipo === "audio" ? "Áudio" : "Documento"} ·{" "}
                    {tamanho(a.tamanhoBytes)}
                    {a.legenda && ` · ${a.nomeArquivo}`}
                  </span>
                </div>
                <div className="flex justify-end gap-1 border-t p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    aria-label={`Baixar ${nome}`}
                    render={<a href={urlArquivo(visitaId, a.id)} target="_blank" rel="noopener" />}
                  >
                    <Download className="size-4" /> Baixar
                  </Button>
                  {editavel && !(assinada && (a.entregaId || a.atividadeVerificadaId)) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Excluir"
                      aria-label={`Excluir ${nome}`}
                      onClick={() => setExcluir(a)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={enviarAberto} onOpenChange={setEnviarAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Enviar arquivo</SheetTitle>
            <SheetDescription>Foto da visita ou documento em PDF, de até 20 MB.</SheetDescription>
          </SheetHeader>
          {enviarAberto && <FormularioAnexo visitaId={visitaId} onFechar={() => setEnviarAberto(false)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setExcluir(null)} />
    </section>
  );
}

/**
 * O CSP do painel não libera imagens da API por http (dev): a miniatura é
 * buscada com o cookie (`connect-src` libera a API) e exibida como `blob:`.
 */
function Miniatura({ visitaId, anexo }: { visitaId: string; anexo: VisitaAnexo }) {
  const imagem = useQuery({
    queryKey: ["visitas", visitaId, "anexos", anexo.id, "miniatura"],
    queryFn: async ({ signal }) => {
      const resposta = await fetch(urlArquivo(visitaId, anexo.id), { credentials: "include", signal });
      // `status` no erro: o retry global não repete 4xx
      if (!resposta.ok) throw Object.assign(new Error("Prévia indisponível"), { status: resposta.status });
      return URL.createObjectURL(await resposta.blob());
    },
  });
  if (!imagem.data) {
    return imagem.isPending ? (
      <Skeleton className="h-40 w-full" />
    ) : (
      <div className="flex h-40 items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        Prévia indisponível
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: local, o otimizador do Next não se aplica
    <img
      src={imagem.data}
      alt={anexo.legenda || anexo.nomeArquivo}
      className="h-40 w-full bg-muted object-cover"
    />
  );
}

function FormularioAnexo({ visitaId, onFechar }: { visitaId: string; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [legenda, setLegenda] = useState("");
  const [tentou, setTentou] = useState(false);
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const erroArquivo = !arquivo
    ? "Escolha o arquivo"
    : ehHeic(arquivo)
      ? "Foto em HEIC (formato do iPhone) não é aceita. Converta para JPEG — enviando pelo próprio iPhone, a conversão é automática."
      : !TIPOS_ANEXO.includes(arquivo.type)
        ? "Envie uma imagem (JPEG, PNG, WebP ou GIF) ou um PDF"
        : arquivo.size > MAX_ARQUIVO
          ? "O arquivo passa de 20 MB"
          : null;
  const mostrarErro = tentou && erroArquivo;

  const enviar = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("arquivo", arquivo!);
      if (legenda.trim()) formData.append("legenda", legenda.trim());
      return fetchData(`/visitas/${visitaId}/anexos`, { method: "POST", formData });
    },
    onSuccess: () => {
      toast.success("Arquivo enviado.");
      queryClient.invalidateQueries({ queryKey: ["visitas", visitaId, "anexos"] });
      onFechar();
    },
    onError: (erro) => erroNoBloco(erro, "Não foi possível enviar o arquivo.", setErrosApi),
  });

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTentou(true);
        setErrosApi([]);
        if (!erroArquivo) enviar.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <ErrosApi erros={errosApi} />
        <div className="grid gap-1.5">
          <Label htmlFor="anexo-arquivo">Arquivo</Label>
          <Input
            id="anexo-arquivo"
            type="file"
            accept={TIPOS_ANEXO.join(",")}
            aria-invalid={!!mostrarErro}
            aria-describedby={mostrarErro ? "anexo-arquivo-erro" : undefined}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          {mostrarErro && (
            <p id="anexo-arquivo-erro" role="alert" className="text-xs text-destructive">
              {erroArquivo}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="anexo-legenda">Legenda (opcional)</Label>
          <Input
            id="anexo-legenda"
            maxLength={500}
            placeholder="Coleta de solo no talhão 2"
            value={legenda}
            onChange={(e) => setLegenda(e.target.value)}
          />
        </div>
      </div>
      <SheetFooter className="flex-row justify-end gap-2 border-t">
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
      </SheetFooter>
    </form>
  );
}

// ─── Itens verificados (acompanhamento na associação) ──────────────────────

function ItensVerificados({ visita, editavel }: { visita: Visita; editavel: boolean }) {
  const queryClient = useQueryClient();
  const [verificar, setVerificar] = useState<Entrega | null>(null);
  const [desfazer, setDesfazer] = useState<Entrega | null>(null);

  // Itens fornecidos (entregues) à associação neste projeto — os que a visita pode conferir
  const fornecidos = useQuery({
    queryKey: [
      "entregas",
      { associacaoId: visita.associacaoId, projetoId: visita.projetoId, situacao: "entregue", limit: LIMITE },
    ],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Entrega[], MetaPaginacao>>("/entregas", {
        query: {
          associacaoId: visita.associacaoId,
          projetoId: visita.projetoId,
          situacao: "entregue",
          limit: LIMITE,
          sort: "dataEntrega:desc",
        },
        signal,
      }),
  });
  const verificados = useQuery(consultaItensVerificados(visita.id));
  const linhas = fornecidos.data?.data ?? [];
  const verificacao = (entregaId: string) => verificados.data?.data.find((i) => i.entregaId === entregaId);
  const conferidos = verificados.data?.data.length ?? 0;
  const carregando = fornecidos.isPending || verificados.isPending;
  const erro = fornecidos.isError ? fornecidos : verificados.isError ? verificados : null;
  const colunas = editavel ? 4 : 3;

  const desfazerMutation = useMutation({
    mutationFn: () =>
      fetchData(`/visitas/${visita.id}/itens-verificados/${desfazer!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Verificação desfeita.");
      setDesfazer(null);
      queryClient.invalidateQueries({ queryKey: ["visitas", visita.id, "itens-verificados"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível desfazer a verificação.")),
  });

  const confirmacao: Confirmacao | null = desfazer
    ? {
        titulo: `Desfazer a verificação de “${desfazer.itemDescricao}”?`,
        descricao:
          "A observação registrada nesta visita é descartada. Se houver fotos do item, exclua-as antes em Fotos e documentos.",
        textoConfirmar: "Desfazer",
        destrutivo: true,
        pendente: desfazerMutation.isPending,
        onConfirmar: () => desfazerMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="itens-verificados-titulo" className="space-y-3">
      <Cabecalho
        id="itens-verificados-titulo"
        titulo="Itens verificados"
        descricao={
          linhas.length > 0
            ? `Itens fornecidos à associação neste projeto — ${conferidos} de ${linhas.length} conferido(s) nesta visita.`
            : "Itens fornecidos à associação neste projeto — registre o que foi visto, com observações e fotos."
        }
      />
      <div className="border" aria-busy={carregando}>
        <Table aria-label="Itens fornecidos à associação">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="hidden sm:table-cell">Entregue em</TableHead>
              <TableHead>Verificação</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={colunas}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : erro ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  {ehSemPermissao(erro.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar os itens.{" "}
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          void fornecidos.refetch();
                          void verificados.refetch();
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  Nenhum item foi entregue a esta associação neste projeto
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((e) => {
                const v = verificacao(e.id);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-[12rem] sm:max-w-md">
                      <div className="flex flex-col">
                        <span className="line-clamp-2 whitespace-normal">{e.itemDescricao}</span>
                        <span className="text-xs whitespace-normal text-muted-foreground">
                          {rotuloCategoriaItem(e.itemCategoria)} · Qtd. {numero(e.quantidade)}
                          {e.lote && ` · ${e.lote}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {dataCalendario(e.dataEntrega)}
                    </TableCell>
                    <TableCell className="max-w-[10rem] sm:max-w-xs">
                      {v ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge>Verificado</Badge>
                          {v.observacao && (
                            <span className="line-clamp-2 text-xs whitespace-normal text-muted-foreground">
                              {v.observacao}
                            </span>
                          )}
                          {v.fotos > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {v.fotos === 1 ? "1 foto" : `${numero(v.fotos)} fotos`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary">Não verificado</Badge>
                      )}
                    </TableCell>
                    {editavel && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={v ? "Editar verificação" : "Registrar verificação"}
                            aria-label={`${v ? "Editar a verificação" : "Registrar a verificação"} de ${e.itemDescricao}`}
                            onClick={() => setVerificar(e)}
                          >
                            <PackageCheck className="size-4" />
                          </Button>
                          {v && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Desfazer verificação"
                              aria-label={`Desfazer a verificação de ${e.itemDescricao}`}
                              onClick={() => setDesfazer(e)}
                            >
                              <Undo2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!verificar} onOpenChange={(aberto) => !aberto && setVerificar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Verificar item</SheetTitle>
            <SheetDescription>
              {verificar &&
                `${verificar.itemDescricao} — ${rotuloCategoriaItem(verificar.itemCategoria)}, qtd. ${numero(verificar.quantidade)}.`}
            </SheetDescription>
          </SheetHeader>
          {verificar && (
            <FormularioVerificacao
              key={verificar.id}
              visitaId={visita.id}
              registro={verificacao(verificar.id)}
              objeto="item"
              placeholder="Estado do item, uso pela associação, problemas encontrados…"
              salvarVerificacao={async (observacao) => {
                await fetchData(`/visitas/${visita.id}/itens-verificados/${verificar.id}`, {
                  method: "PUT",
                  body: { observacao },
                });
                return ["entregaId", verificar.id];
              }}
              onFechar={() => setVerificar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setDesfazer(null)} />
    </section>
  );
}

/**
 * Observação + fotos de uma verificação (item fornecido ou atividade). `salvarVerificacao`
 * grava a verificação e devolve o campo do multipart que liga as fotos a ela.
 */
function FormularioVerificacao({
  visitaId,
  registro,
  objeto,
  placeholder,
  salvarVerificacao,
  onFechar,
}: {
  visitaId: string;
  registro?: { observacao: string | null; fotos: number };
  objeto: "item" | "atividade";
  placeholder: string;
  salvarVerificacao: (observacao: string | null) => Promise<[campo: string, valor: string]>;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [observacao, setObservacao] = useState(registro?.observacao ?? "");
  const [fotos, setFotos] = useState<File[]>([]);
  const [tentou, setTentou] = useState(false);
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const erroFotos = fotos.some(ehHeic)
    ? "Foto em HEIC (formato do iPhone) não é aceita. Converta para JPEG — enviando pelo próprio iPhone, a conversão é automática."
    : fotos.some((f) => !TIPOS_FOTO.includes(f.type))
      ? "Envie fotos em JPEG, PNG, WebP ou GIF"
      : fotos.some((f) => f.size > MAX_ARQUIVO)
        ? "Cada foto pode ter até 20 MB"
        : null;
  const erroObservacao = observacao.length > 5000 ? "No máximo 5.000 caracteres" : null;
  const mostrarErroFotos = tentou && erroFotos;
  const mostrarErroObservacao = tentou && erroObservacao;

  const salvar = useMutation({
    mutationFn: async () => {
      const [campo, valor] = await salvarVerificacao(observacao.trim() || null);
      // A verificação precisa existir antes das fotos (a API recusa foto do que não foi verificado)
      for (const foto of fotos) {
        const formData = new FormData();
        formData.append("arquivo", foto);
        formData.append(campo, valor);
        await fetchData(`/visitas/${visitaId}/anexos`, { method: "POST", formData });
      }
    },
    onSuccess: () => {
      toast.success(fotos.length > 0 ? "Verificação e fotos salvas." : "Verificação salva.");
      onFechar();
    },
    onError: (erro) =>
      erroNoBloco(
        erro,
        fotos.length > 0
          ? "A verificação foi salva, mas nem todas as fotos foram enviadas."
          : "Não foi possível salvar a verificação.",
        setErrosApi,
      ),
    // Sucesso ou falha no meio das fotos: o que chegou à API aparece na tela
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["visitas", visitaId, objeto === "item" ? "itens-verificados" : "atividades"],
      });
      queryClient.invalidateQueries({ queryKey: ["visitas", visitaId, "anexos"] });
    },
  });

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTentou(true);
        setErrosApi([]);
        if (!erroFotos && !erroObservacao) salvar.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <ErrosApi erros={errosApi} />
        <div className="grid gap-1.5">
          <Label htmlFor="verificacao-observacao">Observações (opcional)</Label>
          <Textarea
            id="verificacao-observacao"
            rows={5}
            placeholder={placeholder}
            value={observacao}
            aria-invalid={!!mostrarErroObservacao}
            aria-describedby={mostrarErroObservacao ? "verificacao-observacao-erro" : undefined}
            onChange={(e) => setObservacao(e.target.value)}
          />
          {mostrarErroObservacao && (
            <p id="verificacao-observacao-erro" role="alert" className="text-xs text-destructive">
              {erroObservacao}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="verificacao-fotos">
            {objeto === "item" ? "Fotos do item" : "Fotos da atividade"} (opcional)
          </Label>
          <Input
            id="verificacao-fotos"
            type="file"
            multiple
            accept={TIPOS_FOTO.join(",")}
            aria-invalid={!!mostrarErroFotos}
            aria-describedby={mostrarErroFotos ? "verificacao-fotos-erro" : "verificacao-fotos-dica"}
            onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
          />
          {mostrarErroFotos ? (
            <p id="verificacao-fotos-erro" role="alert" className="text-xs text-destructive">
              {erroFotos}
            </p>
          ) : (
            <p id="verificacao-fotos-dica" className="text-xs text-muted-foreground">
              {registro?.fotos
                ? `Já há ${registro.fotos === 1 ? "1 foto" : `${numero(registro.fotos)} fotos`} ${objeto === "item" ? "deste item" : "desta atividade"}; as novas se somam a elas.`
                : "Até 20 MB cada. As fotos também aparecem em Fotos e documentos."}
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
            "Registrar verificação"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

// ─── Atividades verificadas (assistência técnica) ──────────────────────────

const chaveLinha = (l: LinhaAtividade) => `${l.opcaoId}:${l.subdivisaoId ?? ""}`;

function AtividadesVerificadas({ visita, editavel }: { visita: Visita; editavel: boolean }) {
  const queryClient = useQueryClient();
  const [verificar, setVerificar] = useState<LinhaAtividade | null>(null);
  const [desfazer, setDesfazer] = useState<LinhaAtividade | null>(null);

  const atividades = useQuery(consultaAtividades(visita.id));
  const diagnostico = atividades.data?.data.diagnostico;
  const linhas = atividades.data?.data.linhas ?? [];
  const conferidas = linhas.filter((l) => l.verificacao).length;
  const colunas = editavel ? 3 : 2;

  const desfazerMutation = useMutation({
    mutationFn: () =>
      fetchData(`/visitas/${visita.id}/atividades-verificadas/${desfazer!.verificacao!.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("Verificação desfeita.");
      setDesfazer(null);
      queryClient.invalidateQueries({ queryKey: ["visitas", visita.id, "atividades"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível desfazer a verificação.")),
  });

  const confirmacao: Confirmacao | null = desfazer
    ? {
        titulo: `Desfazer a verificação de “${nomeAtividade(desfazer)}”?`,
        descricao:
          "A observação registrada nesta visita é descartada. Se houver fotos da atividade, exclua-as antes em Fotos e documentos.",
        textoConfirmar: "Desfazer",
        destrutivo: true,
        pendente: desfazerMutation.isPending,
        onConfirmar: () => desfazerMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="atividades-titulo" className="space-y-3">
      <Cabecalho
        id="atividades-titulo"
        titulo="Atividades verificadas"
        descricao={
          diagnostico
            ? `Atividades do diagnóstico de ${dataCalendario(diagnostico.data)} — ${conferidas} de ${linhas.length} verificada(s) nesta visita.`
            : "Atividades produtivas da propriedade — registre o que foi visto, com observações e fotos."
        }
      />
      {diagnostico && (
        <p className="text-xs text-muted-foreground">
          A lista vem do{" "}
          <Link
            href={`/visitas/${diagnostico.visitaId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            último diagnóstico da propriedade
          </Link>
          ; as subdivisões são editadas em Cadastros → Opções de diagnóstico.
        </p>
      )}
      <div className="border" aria-busy={atividades.isPending}>
        <Table aria-label="Atividades da propriedade">
          <TableHeader>
            <TableRow>
              <TableHead>Atividade</TableHead>
              <TableHead>Verificação</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {atividades.isPending ? (
              <TableRow>
                <TableCell colSpan={colunas}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : atividades.isError ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  {ehSemPermissao(atividades.error) ? (
                    "Você não tem permissão para ver isto."
                  ) : (
                    <>
                      Erro ao carregar as atividades.{" "}
                      <Button variant="link" size="sm" onClick={() => atividades.refetch()}>
                        Tentar novamente
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colunas}
                  className="py-6 text-center whitespace-normal text-muted-foreground"
                >
                  {diagnostico
                    ? "O último diagnóstico da propriedade não tem atividades produtivas marcadas"
                    : "A propriedade ainda não tem diagnóstico — as atividades vêm de lá"}
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => (
                <TableRow key={chaveLinha(l)}>
                  <TableCell className="max-w-[12rem] sm:max-w-md">
                    <div className="flex flex-col">
                      <span className="line-clamp-2 whitespace-normal">{l.subdivisao ?? l.atividade}</span>
                      {(l.subdivisao || l.detalhe) && (
                        <span className="text-xs whitespace-normal text-muted-foreground">
                          {l.subdivisao ? l.atividade : l.detalhe}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[10rem] sm:max-w-md">
                    {l.verificacao ? (
                      <div className="flex flex-col items-start gap-1">
                        <Badge>Verificada</Badge>
                        {l.verificacao.observacao && (
                          <span className="line-clamp-2 text-xs whitespace-normal text-muted-foreground">
                            {l.verificacao.observacao}
                          </span>
                        )}
                        {l.verificacao.fotos > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {l.verificacao.fotos === 1 ? "1 foto" : `${numero(l.verificacao.fotos)} fotos`}
                          </span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="secondary">Não verificada</Badge>
                    )}
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={l.verificacao ? "Editar verificação" : "Registrar verificação"}
                          aria-label={`${l.verificacao ? "Editar a verificação" : "Registrar a verificação"} de ${nomeAtividade(l)}`}
                          onClick={() => setVerificar(l)}
                        >
                          <ClipboardCheck className="size-4" />
                        </Button>
                        {l.verificacao && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Desfazer verificação"
                            aria-label={`Desfazer a verificação de ${nomeAtividade(l)}`}
                            onClick={() => setDesfazer(l)}
                          >
                            <Undo2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!verificar} onOpenChange={(aberto) => !aberto && setVerificar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Verificar atividade</SheetTitle>
            <SheetDescription>{verificar && nomeAtividade(verificar)}</SheetDescription>
          </SheetHeader>
          {verificar && (
            <FormularioVerificacao
              key={chaveLinha(verificar)}
              visitaId={visita.id}
              registro={verificar.verificacao ?? undefined}
              objeto="atividade"
              placeholder="Manejo observado, problemas, evolução desde a última visita…"
              salvarVerificacao={async (observacao) => {
                const { data } = await fetchData<Envelope<{ id: string }>>(
                  `/visitas/${visita.id}/atividades-verificadas`,
                  {
                    method: "PUT",
                    body: { opcaoId: verificar.opcaoId, subdivisaoId: verificar.subdivisaoId, observacao },
                  },
                );
                return ["atividadeVerificadaId", data.id];
              }}
              onFechar={() => setVerificar(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setDesfazer(null)} />
    </section>
  );
}

// ─── Assinatura da visita ──────────────────────────────────────────────────

function AssinaturaVisita({ visita, editavel }: { visita: Visita; editavel: boolean }) {
  const [colher, setColher] = useState(false);
  const base = `/visitas/${visita.id}`;
  const chave = ["visitas", visita.id, "assinatura"];
  const assinatura = useAssinatura(base, chave);
  const acompanhamento = visita.tipo === "acompanhamento";

  // Assina só quem tem o que confirmar: a API recusa visita sem nada verificado
  const itens = useQuery({ ...consultaItensVerificados(visita.id), enabled: acompanhamento });
  const atividades = useQuery({ ...consultaAtividades(visita.id), enabled: !acompanhamento });
  const verificados = acompanhamento
    ? (itens.data?.data.length ?? 0)
    : (atividades.data?.data.linhas.filter((l) => l.verificacao).length ?? 0);
  const papeis: PapelAssinante[] = acompanhamento ? ["presidente", "vice_presidente"] : ["proprietario"];
  const quem = acompanhamento ? "o presidente ou o vice-presidente da associação" : "o proprietário";
  const oQue = acompanhamento ? "itens verificados" : "atividades verificadas";
  // "o item verificado" / "os 3 itens verificados"
  const contagem =
    verificados === 1
      ? acompanhamento
        ? "o item verificado"
        : "a atividade verificada"
      : `${acompanhamento ? "os" : "as"} ${verificados} ${oQue}`;
  const dado = assinatura.data?.data;

  return (
    <section aria-labelledby="assinatura-titulo" className="space-y-3">
      <Cabecalho
        id="assinatura-titulo"
        titulo="Assinatura"
        descricao={`Assinada por ${quem}, confirma ${acompanhamento ? "os" : "as"} ${oQue} desta visita.`}
        acao={
          editavel &&
          !dado &&
          !assinatura.isPending && (
            <Button onClick={() => setColher(true)} disabled={verificados === 0}>
              <IconeAssinar className="size-4" /> Colher assinatura
            </Button>
          )
        }
      />
      {assinatura.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : assinatura.isError ? (
        <p className="border py-6 text-center text-sm text-muted-foreground">
          {ehSemPermissao(assinatura.error) ? (
            "Você não tem permissão para ver isto."
          ) : (
            <>
              Erro ao carregar a assinatura.{" "}
              <Button variant="link" size="sm" onClick={() => assinatura.refetch()}>
                Tentar novamente
              </Button>
            </>
          )}
        </p>
      ) : dado ? (
        <CartaoAssinatura
          base={base}
          queryKey={chave}
          assinatura={dado}
          editavel={editavel}
          avisoRemover={`${acompanhamento ? "Os" : "As"} ${oQue} voltam a poder ser ${acompanhamento ? "alterados" : "alteradas"}; depois, colha a assinatura de novo. A remoção fica no histórico.`}
        />
      ) : (
        <p className="border py-6 text-center text-sm whitespace-normal text-muted-foreground">
          {verificados === 0
            ? `Ainda não assinada — registre ao menos ${acompanhamento ? "um item verificado" : "uma atividade verificada"} antes de colher a assinatura.`
            : "Ainda não assinada."}
        </p>
      )}
      {dado && editavel && (
        <p className="text-xs text-muted-foreground">
          Visita assinada:{" "}
          {acompanhamento
            ? "os itens verificados e as fotos deles ficam travados"
            : "as atividades verificadas e as fotos delas ficam travadas"}
          . Para alterar, remova a assinatura.
        </p>
      )}

      <ModalAssinatura
        aberto={colher}
        onAbertoChange={setColher}
        titulo={`Assinatura — ${acompanhamento ? "acompanhamento" : "assistência técnica"}`}
        descricao={
          acompanhamento
            ? visita.associacaoSigla
            : [visita.produtorNome, visita.propriedadeNome].filter(Boolean).join(" — ")
        }
        base={base}
        queryKey={chave}
        papeis={papeis}
        cadastroContatos={visita.associacaoId ? `/associacoes/${visita.associacaoId}` : undefined}
        aviso={`Ao assinar, ${quem} confirma ${contagem} desta visita. Depois de assinada, a verificação não pode mais ser alterada sem remover a assinatura.`}
      />
    </section>
  );
}

// ─── Diagnóstico da propriedade ────────────────────────────────────────────

/** "1.234,5" ou "12.5" → número; vazio → null. */
const paraNumero = (v: string) => {
  const t = v.trim();
  if (t === "") return null;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};
const decimal = (rotulo: string) =>
  z
    .string()
    .transform(paraNumero)
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 99_999_999.99), `${rotulo} inválida`);
const inteiro = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), "Use um número inteiro")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || v <= max, "Número muito grande");
const booleano = z.enum(["", "sim", "nao"]).transform((v) => (v === "" ? null : v === "sim"));
const resposta = z
  .enum(["", "sim", "nao", "parcialmente", "nao_sei"])
  .transform((v) => (v === "" ? null : v));

const schemaDiagnostico = z.object({
  areaProdutivaHa: decimal("Área"),
  areaPastagemHa: decimal("Área"),
  areaPreservadaHa: decimal("Área"),
  principaisCulturas: z.string().trim().max(2000, "No máximo 2.000 caracteres"),
  rebanhoBovino: inteiro(2_000_000_000),
  fonteAgua: z.string().trim().max(200, "No máximo 200 caracteres"),
  possuiEnergia: booleano,
  possuiIrrigacao: booleano,
  pessoasTrabalham: inteiro(32_767),
  analiseSoloRecente: resposta,
  acessoMaquinario: resposta,
  comentarios: z.string().trim().max(10_000, "No máximo 10.000 caracteres"),
});
type FormDiagnostico = z.input<typeof schemaDiagnostico>;
type FormDiagnosticoSaida = z.output<typeof schemaDiagnostico>;

const textoNumero = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const textoBool = (b: boolean | null): "" | "sim" | "nao" => (b === null ? "" : b ? "sim" : "nao");

function useOpcoesGrupo(grupo: OpcaoDiagnostico["grupo"]) {
  return useQuery({
    queryKey: ["opcoes-diagnostico", { grupo, ativo: true, limit: LIMITE }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<OpcaoDiagnostico[], MetaPaginacao>>("/opcoes-diagnostico", {
        query: { grupo, ativo: true, limit: LIMITE },
        signal,
      }),
  });
}

function DiagnosticoSecao({ visitaId, editavel }: { visitaId: string; editavel: boolean }) {
  const [aberto, setAberto] = useState(false);
  const diagnostico = useQuery({
    queryKey: ["visitas", visitaId, "diagnostico"],
    queryFn: ({ signal }) => fetchData<Envelope<Diagnostico>>(`/visitas/${visitaId}/diagnostico`, { signal }),
  });
  const atividades = useOpcoesGrupo("atividade_produtiva");
  const problemas = useOpcoesGrupo("problema_solo");
  // 404 = ainda não preenchido (não é erro para a tela)
  const naoPreenchido = diagnostico.isError && (diagnostico.error as Partial<ErroApi>).status === 404;
  const d = diagnostico.data?.data;
  const carregandoForm = atividades.isPending || problemas.isPending;

  return (
    <section aria-labelledby="diagnostico-titulo" className="space-y-3">
      <Cabecalho
        id="diagnostico-titulo"
        titulo="Diagnóstico da propriedade"
        descricao="Áreas, estrutura, atividades produtivas e problemas de solo levantados na visita."
        acao={
          editavel &&
          (d || naoPreenchido) && (
            <Button variant="outline" onClick={() => setAberto(true)}>
              {d ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {d ? "Editar diagnóstico" : "Preencher diagnóstico"}
            </Button>
          )
        }
      />
      <div className="border p-4 text-sm" aria-busy={diagnostico.isPending}>
        {diagnostico.isPending ? (
          <>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-4 w-2/3" />
          </>
        ) : naoPreenchido ? (
          <p className="text-muted-foreground">O diagnóstico desta visita ainda não foi preenchido.</p>
        ) : diagnostico.isError ? (
          <p className="text-muted-foreground">
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
            <div className="grid gap-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Área produtiva</dt>
                  <dd className="tabular-nums">
                    {d.areaProdutivaHa !== null ? `${textoNumero(d.areaProdutivaHa)} ha` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pastagem</dt>
                  <dd className="tabular-nums">
                    {d.areaPastagemHa !== null ? `${textoNumero(d.areaPastagemHa)} ha` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Área preservada</dt>
                  <dd className="tabular-nums">
                    {d.areaPreservadaHa !== null ? `${textoNumero(d.areaPreservadaHa)} ha` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rebanho bovino</dt>
                  <dd className="tabular-nums">{numero(d.rebanhoBovino)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fonte de água</dt>
                  <dd>{d.fonteAgua ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Energia / irrigação</dt>
                  <dd>
                    {simNao(d.possuiEnergia)} / {simNao(d.possuiIrrigacao)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pessoas que trabalham</dt>
                  <dd className="tabular-nums">{numero(d.pessoasTrabalham)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Análise de solo recente</dt>
                  <dd>{rotuloResposta(d.analiseSoloRecente)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Acesso a maquinário</dt>
                  <dd>{rotuloResposta(d.acessoMaquinario)}</dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-muted-foreground">Principais culturas</dt>
                  <dd>{d.principaisCulturas ?? "—"}</dd>
                </div>
              </dl>
              {GRUPOS_DIAGNOSTICO.map((g) => {
                const marcadas = d.opcoes.filter((o) => o.grupo === g.grupo);
                return (
                  <div key={g.grupo}>
                    <h3 className="text-muted-foreground">{g.rotulo}</h3>
                    {marcadas.length === 0 ? (
                      <p>—</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {marcadas.map((o) => (
                          <li key={o.opcaoId}>
                            <Badge variant="secondary">
                              {o.nome}
                              {o.detalhe && `: ${o.detalhe}`}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {d.comentarios && (
                <div>
                  <h3 className="text-muted-foreground">Comentários</h3>
                  <p className="whitespace-pre-line">{d.comentarios}</p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Diagnóstico da propriedade</SheetTitle>
            <SheetDescription>Deixe em branco o que não foi levantado.</SheetDescription>
          </SheetHeader>
          {aberto &&
            (carregandoForm ? (
              <div className="grid gap-3 p-4">
                <span role="status" className="sr-only">
                  Carregando…
                </span>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : (
              <FormularioDiagnostico
                visitaId={visitaId}
                registro={d}
                catalogo={[...(atividades.data?.data ?? []), ...(problemas.data?.data ?? [])]}
                onFechar={() => setAberto(false)}
              />
            ))}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function FormularioDiagnostico({
  visitaId,
  registro,
  catalogo,
  onFechar,
}: {
  visitaId: string;
  registro?: Diagnostico;
  catalogo: OpcaoDiagnostico[];
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  // opcaoId → texto do "Outro" (vazio quando a opção não pede detalhe)
  const [marcadas, setMarcadas] = useState<Record<string, string>>(() =>
    Object.fromEntries((registro?.opcoes ?? []).map((o) => [o.opcaoId, o.detalhe ?? ""])),
  );

  const form = useForm<FormDiagnostico, unknown, FormDiagnosticoSaida>({
    resolver: zodResolver(schemaDiagnostico),
    defaultValues: {
      areaProdutivaHa: textoNumero(registro?.areaProdutivaHa ?? null),
      areaPastagemHa: textoNumero(registro?.areaPastagemHa ?? null),
      areaPreservadaHa: textoNumero(registro?.areaPreservadaHa ?? null),
      principaisCulturas: registro?.principaisCulturas ?? "",
      rebanhoBovino: registro?.rebanhoBovino != null ? String(registro.rebanhoBovino) : "",
      fonteAgua: registro?.fonteAgua ?? "",
      possuiEnergia: textoBool(registro?.possuiEnergia ?? null),
      possuiIrrigacao: textoBool(registro?.possuiIrrigacao ?? null),
      pessoasTrabalham: registro?.pessoasTrabalham != null ? String(registro.pessoasTrabalham) : "",
      analiseSoloRecente: registro?.analiseSoloRecente ?? "",
      acessoMaquinario: registro?.acessoMaquinario ?? "",
      comentarios: registro?.comentarios ?? "",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  // Opções ativas do catálogo + as já marcadas que foram desativadas depois (continuam aceitas)
  const opcoesPorGrupo = useMemo(
    () =>
      GRUPOS_DIAGNOSTICO.map((g) => {
        const ativas = catalogo
          .filter((o) => o.grupo === g.grupo)
          .map((o) => ({ id: o.id, nome: o.nome, permiteDetalhe: o.permiteDetalhe }));
        const antigas = (registro?.opcoes ?? [])
          .filter((o) => o.grupo === g.grupo && !ativas.some((a) => a.id === o.opcaoId))
          .map((o) => ({
            id: o.opcaoId,
            nome: `${o.nome} (desativada)`,
            permiteDetalhe: o.detalhe !== null,
          }));
        return { ...g, opcoes: [...ativas, ...antigas] };
      }),
    [catalogo, registro],
  );
  const permiteDetalhe = (id: string) =>
    opcoesPorGrupo.some((g) => g.opcoes.some((o) => o.id === id && o.permiteDetalhe));

  const salvar = useMutation({
    mutationFn: (dados: FormDiagnosticoSaida) =>
      fetchData(`/visitas/${visitaId}/diagnostico`, {
        method: "PUT",
        body: {
          ...dados,
          principaisCulturas: dados.principaisCulturas || null,
          fonteAgua: dados.fonteAgua || null,
          comentarios: dados.comentarios || null,
          opcoes: Object.entries(marcadas).map(([opcaoId, detalhe]) => ({
            opcaoId,
            detalhe: permiteDetalhe(opcaoId) ? detalhe.trim() || null : null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Diagnóstico salvo.");
      queryClient.invalidateQueries({ queryKey: ["visitas", visitaId, "diagnostico"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else erroNoBloco(erro, "Não foi possível salvar o diagnóstico.", setErrosApi);
    },
  });

  const aria = (nome: keyof FormDiagnostico) => ({
    id: `diag-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `diag-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormDiagnostico) =>
    errors[nome] && (
      <p id={`diag-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message}
      </p>
    );
  const simNaoSelect = (nome: "possuiEnergia" | "possuiIrrigacao") => (
    <NativeSelect className="w-full" {...aria(nome)} {...register(nome)}>
      <NativeSelectOption value="">Não informado</NativeSelectOption>
      <NativeSelectOption value="sim">Sim</NativeSelectOption>
      <NativeSelectOption value="nao">Não</NativeSelectOption>
    </NativeSelect>
  );
  const respostaSelect = (nome: "analiseSoloRecente" | "acessoMaquinario") => (
    <NativeSelect className="w-full" {...aria(nome)} {...register(nome)}>
      <NativeSelectOption value="">Não informado</NativeSelectOption>
      {RESPOSTAS.map((r) => (
        <NativeSelectOption key={r.valor} value={r.valor}>
          {r.rotulo}
        </NativeSelectOption>
      ))}
    </NativeSelect>
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
        <ErrosApi erros={errosApi} />

        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="diag-areaProdutivaHa">Produtiva (ha)</Label>
            <Input inputMode="decimal" {...aria("areaProdutivaHa")} {...register("areaProdutivaHa")} />
            {erro("areaProdutivaHa")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diag-areaPastagemHa">Pastagem (ha)</Label>
            <Input inputMode="decimal" {...aria("areaPastagemHa")} {...register("areaPastagemHa")} />
            {erro("areaPastagemHa")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diag-areaPreservadaHa">Preservada (ha)</Label>
            <Input inputMode="decimal" {...aria("areaPreservadaHa")} {...register("areaPreservadaHa")} />
            {erro("areaPreservadaHa")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="diag-principaisCulturas">Principais culturas</Label>
          <Textarea
            rows={2}
            placeholder="Café, milho, mandioca…"
            {...aria("principaisCulturas")}
            {...register("principaisCulturas")}
          />
          {erro("principaisCulturas")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="diag-rebanhoBovino">Rebanho bovino</Label>
            <Input inputMode="numeric" {...aria("rebanhoBovino")} {...register("rebanhoBovino")} />
            {erro("rebanhoBovino")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diag-pessoasTrabalham">Pessoas que trabalham</Label>
            <Input inputMode="numeric" {...aria("pessoasTrabalham")} {...register("pessoasTrabalham")} />
            {erro("pessoasTrabalham")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="diag-fonteAgua">Fonte de água</Label>
          <Input
            maxLength={200}
            placeholder="Poço, nascente, rio…"
            {...aria("fonteAgua")}
            {...register("fonteAgua")}
          />
          {erro("fonteAgua")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="diag-possuiEnergia">Possui energia</Label>
            {simNaoSelect("possuiEnergia")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diag-possuiIrrigacao">Possui irrigação</Label>
            {simNaoSelect("possuiIrrigacao")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diag-analiseSoloRecente">Análise de solo recente</Label>
            {respostaSelect("analiseSoloRecente")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="diag-acessoMaquinario">Acesso a maquinário</Label>
            {respostaSelect("acessoMaquinario")}
          </div>
        </div>

        {opcoesPorGrupo.map((g) => (
          <fieldset key={g.grupo} className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{g.rotulo}</legend>
            {g.opcoes.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma opção cadastrada.</p>
            )}
            {g.opcoes.map((o) => {
              const marcada = o.id in marcadas;
              return (
                <div key={o.id} className="grid gap-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`diag-opcao-${o.id}`}
                      checked={marcada}
                      onCheckedChange={(v) =>
                        setMarcadas((atual) => {
                          const proximo = { ...atual };
                          if (v) proximo[o.id] = "";
                          else delete proximo[o.id];
                          return proximo;
                        })
                      }
                    />
                    <Label htmlFor={`diag-opcao-${o.id}`} className="font-normal">
                      {o.nome}
                    </Label>
                  </div>
                  {marcada && o.permiteDetalhe && (
                    <Input
                      className="ml-6 w-auto"
                      maxLength={500}
                      aria-label={`Qual? (${o.nome})`}
                      placeholder="Qual?"
                      value={marcadas[o.id]}
                      onChange={(e) => setMarcadas((atual) => ({ ...atual, [o.id]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}

        <div className="grid gap-1.5">
          <Label htmlFor="diag-comentarios">Comentários</Label>
          <Textarea rows={4} {...aria("comentarios")} {...register("comentarios")} />
          {erro("comentarios")}
        </div>
      </div>
      <RodapeForm pendente={salvar.isPending} onFechar={onFechar} texto="Salvar" />
    </form>
  );
}

// ─── Recomendações (assistência técnica) ───────────────────────────────────

const schemaRecomendacao = z.object({
  categoria: z.enum(["calagem", "adubacao", "manejo_solo", "manejo_cultura", "sanidade", "gestao", "outro"]),
  cultura: z.string().trim().max(200, "No máximo 200 caracteres"),
  descricao: z.string().trim().min(1, "Descreva a recomendação").max(5000, "No máximo 5.000 caracteres"),
  prazo: z.union([z.literal(""), z.iso.date("Data inválida")]),
  situacao: z.enum(["pendente", "em_andamento", "adotada", "nao_adotada"]),
});
type FormRecomendacao = z.infer<typeof schemaRecomendacao>;

function RecomendacoesDaVisita({ visitaId, editavel }: { visitaId: string; editavel: boolean }) {
  const queryClient = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [editar, setEditar] = useState<Recomendacao | null>(null);
  const [excluir, setExcluir] = useState<Recomendacao | null>(null);

  const recomendacoes = useQuery({
    queryKey: ["recomendacoes", { visitaId, limit: LIMITE }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Recomendacao[], MetaPaginacao>>("/recomendacoes", {
        query: { visitaId, limit: LIMITE, sort: "createdAt:asc" },
        signal,
      }),
  });
  const linhas = recomendacoes.data?.data ?? [];
  const colunas = editavel ? 5 : 4;

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/recomendacoes/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Recomendação excluída.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["recomendacoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir a recomendação.")),
  });

  const confirmacao: Confirmacao | null = excluir
    ? {
        titulo: "Excluir a recomendação?",
        descricao: excluir.descricao,
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
      }
    : null;

  return (
    <section aria-labelledby="recomendacoes-titulo" className="space-y-3">
      <Cabecalho
        id="recomendacoes-titulo"
        titulo="Recomendações"
        descricao="Orientações dadas ao produtor nesta visita; o acompanhamento confere a adoção."
        acao={
          editavel && (
            <Button variant="outline" onClick={() => setNovaAberta(true)}>
              <Plus className="size-4" /> Incluir recomendação
            </Button>
          )
        }
      />
      <div className="border" aria-busy={recomendacoes.isPending}>
        <Table aria-label="Recomendações da visita">
          <TableHeader>
            <TableRow>
              <TableHead>Recomendação</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead className="hidden sm:table-cell">Prazo</TableHead>
              <TableHead>Situação</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {recomendacoes.isPending ? (
              <TableRow>
                <TableCell colSpan={colunas}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : recomendacoes.isError ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
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
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  Nenhuma recomendação registrada nesta visita
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[12rem] sm:max-w-md">
                    <div className="flex flex-col">
                      <span className="line-clamp-2 whitespace-normal">{r.descricao}</span>
                      {r.cultura && <span className="text-xs text-muted-foreground">{r.cultura}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{rotuloCategoria(r.categoria)}</TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    {dataCalendario(r.prazo)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={varianteSituacaoRec(r.situacao)}>{rotuloSituacaoRec(r.situacao)}</Badge>
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Editar"
                          aria-label={`Editar a recomendação: ${r.descricao.slice(0, 60)}`}
                          onClick={() => setEditar(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Excluir"
                          aria-label={`Excluir a recomendação: ${r.descricao.slice(0, 60)}`}
                          onClick={() => setExcluir(r)}
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

      <Sheet open={novaAberta} onOpenChange={setNovaAberta}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Nova recomendação</SheetTitle>
            <SheetDescription>
              A recomendação fica ligada a esta visita e à propriedade dela.
            </SheetDescription>
          </SheetHeader>
          {novaAberta && <FormularioRecomendacao visitaId={visitaId} onFechar={() => setNovaAberta(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar recomendação</SheetTitle>
            <SheetDescription>Alterações valem assim que salvar.</SheetDescription>
          </SheetHeader>
          {editar && (
            <FormularioRecomendacao
              key={editar.id}
              visitaId={visitaId}
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

function FormularioRecomendacao({
  visitaId,
  registro,
  onFechar,
}: {
  visitaId: string;
  registro?: Recomendacao;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormRecomendacao>({
    resolver: zodResolver(schemaRecomendacao),
    defaultValues: {
      categoria: registro?.categoria ?? "adubacao",
      cultura: registro?.cultura ?? "",
      descricao: registro?.descricao ?? "",
      prazo: registro?.prazo ?? "",
      situacao: registro?.situacao ?? "pendente",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (d: FormRecomendacao) => {
      const body = { ...d, cultura: d.cultura || null, prazo: d.prazo || null };
      return registro
        ? fetchData(`/recomendacoes/${registro.id}`, { method: "PATCH", body })
        : fetchData("/recomendacoes", { method: "POST", body: { visitaId, ...body } });
    },
    onSuccess: () => {
      toast.success(registro ? "Recomendação atualizada." : "Recomendação registrada.");
      queryClient.invalidateQueries({ queryKey: ["recomendacoes"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else erroNoBloco(erro, "Não foi possível salvar a recomendação.", setErrosApi);
    },
  });

  const aria = (nome: keyof FormRecomendacao) => ({
    id: `rec-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `rec-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormRecomendacao) =>
    errors[nome] && (
      <p id={`rec-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
        <ErrosApi erros={errosApi} />
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rec-categoria">Categoria</Label>
            <NativeSelect className="w-full" {...aria("categoria")} {...register("categoria")}>
              {CATEGORIAS.map((c) => (
                <NativeSelectOption key={c.valor} value={c.valor}>
                  {c.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rec-cultura">Cultura (opcional)</Label>
            <Input maxLength={200} placeholder="Café" {...aria("cultura")} {...register("cultura")} />
            {erro("cultura")}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rec-descricao">Descrição</Label>
          <Textarea rows={4} {...aria("descricao")} {...register("descricao")} />
          {erro("descricao")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rec-prazo">Prazo (opcional)</Label>
            <Input type="date" {...aria("prazo")} {...register("prazo")} />
            {erro("prazo")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rec-situacao">Situação</Label>
            <NativeSelect className="w-full" {...aria("situacao")} {...register("situacao")}>
              {SITUACOES_RECOMENDACAO.map((s) => (
                <NativeSelectOption key={s.valor} value={s.valor}>
                  {s.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>
      <RodapeForm pendente={salvar.isPending} onFechar={onFechar} texto={registro ? "Salvar" : "Registrar"} />
    </form>
  );
}

// ─── Verificação no acompanhamento ─────────────────────────────────────────

function Verificacoes({
  visita,
  propriedadeId,
  editavel,
}: {
  visita: Visita;
  propriedadeId: string;
  editavel: boolean;
}) {
  const queryClient = useQueryClient();
  const [verificar, setVerificar] = useState<Recomendacao | null>(null);
  const [novaSituacao, setNovaSituacao] = useState<SituacaoRecomendacao>("adotada");

  const recomendacoes = useQuery({
    queryKey: ["recomendacoes", { propriedadeId, projetoId: visita.projetoId, limit: LIMITE }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Recomendacao[], MetaPaginacao>>("/recomendacoes", {
        query: { propriedadeId, projetoId: visita.projetoId, limit: LIMITE, sort: "prazo:asc" },
        signal,
      }),
  });
  // Pendentes da propriedade + as que este acompanhamento já conferiu
  const linhas = (recomendacoes.data?.data ?? []).filter(
    (r) => r.situacao === "pendente" || r.situacao === "em_andamento" || r.verificadaEmVisitaId === visita.id,
  );
  const colunas = editavel ? 5 : 4;

  const verificarMutation = useMutation({
    mutationFn: () =>
      fetchData(`/recomendacoes/${verificar!.id}`, {
        method: "PATCH",
        body: { situacao: novaSituacao, verificadaEmVisitaId: visita.id },
      }),
    onSuccess: () => {
      toast.success("Verificação registrada.");
      setVerificar(null);
      queryClient.invalidateQueries({ queryKey: ["recomendacoes"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível registrar a verificação.")),
  });

  const confirmacao: Confirmacao | null = verificar
    ? {
        titulo: "Marcar verificação",
        descricao: verificar.descricao,
        textoConfirmar: "Registrar",
        pendente: verificarMutation.isPending,
        onConfirmar: () => verificarMutation.mutate(),
        children: (
          <div className="grid gap-1.5 px-1">
            <Label htmlFor="verificacao-situacao">O que foi visto neste acompanhamento</Label>
            <NativeSelect
              id="verificacao-situacao"
              className="w-full"
              value={novaSituacao}
              onChange={(e) => setNovaSituacao(e.target.value as SituacaoRecomendacao)}
            >
              {SITUACOES_RECOMENDACAO.map((s) => (
                <NativeSelectOption key={s.valor} value={s.valor}>
                  {s.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ),
      }
    : null;

  return (
    <section aria-labelledby="verificacoes-titulo" className="space-y-3">
      <Cabecalho
        id="verificacoes-titulo"
        titulo="Recomendações a conferir"
        descricao="Recomendações pendentes desta propriedade no projeto — registre o que foi adotado."
      />
      <div className="border" aria-busy={recomendacoes.isPending}>
        <Table aria-label="Recomendações pendentes da propriedade">
          <TableHeader>
            <TableRow>
              <TableHead>Recomendação</TableHead>
              <TableHead className="hidden md:table-cell">Dada em</TableHead>
              <TableHead className="hidden sm:table-cell">Prazo</TableHead>
              <TableHead>Situação</TableHead>
              {editavel && <TableHead className="w-24 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {recomendacoes.isPending ? (
              <TableRow>
                <TableCell colSpan={colunas}>
                  <span role="status" className="sr-only">
                    Carregando…
                  </span>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              </TableRow>
            ) : recomendacoes.isError ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
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
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  Nenhuma recomendação pendente nesta propriedade
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[12rem] sm:max-w-md">
                    <div className="flex flex-col">
                      <span className="line-clamp-2 whitespace-normal">{r.descricao}</span>
                      <span className="text-xs text-muted-foreground">
                        {rotuloCategoria(r.categoria)}
                        {r.cultura && ` · ${r.cultura}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    <Link
                      href={`/visitas/${r.visitaId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {dataCalendario(r.visitaData)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">
                    {dataCalendario(r.prazo)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={varianteSituacaoRec(r.situacao)}>{rotuloSituacaoRec(r.situacao)}</Badge>
                      {r.verificadaEmVisitaId === visita.id && (
                        <span className="text-xs text-muted-foreground">conferida aqui</span>
                      )}
                    </div>
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Marcar verificação"
                        aria-label={`Marcar verificação: ${r.descricao.slice(0, 60)}`}
                        onClick={() => {
                          setNovaSituacao(r.verificadaEmVisitaId === visita.id ? r.situacao : "adotada");
                          setVerificar(r);
                        }}
                      >
                        <ClipboardCheck className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setVerificar(null)} />
    </section>
  );
}
