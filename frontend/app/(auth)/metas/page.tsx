"use client";

import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { toast } from "react-toastify";
import { ClipboardPen, Hand, Pencil, Plus, Target, Trash2, TriangleAlert, Zap } from "lucide-react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Seletor } from "@/components/seletor";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { moeda, numero } from "@/lib/formato";
import { centavosDeTexto, textoDeCentavos } from "@/lib/dinheiro";
import { usePapel } from "@/lib/papeis";
import { cn } from "@/lib/utils";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Meta = components["schemas"]["Meta"];
type Indicador = components["schemas"]["IndicadorApurado"];
type Etapa = components["schemas"]["EtapaApurada"];
type ChaveApuracao = components["schemas"]["ChaveApuracao"];
type SituacaoMeta = Meta["situacao"];
type ResumoMetas = { percentualProjeto: number; valorAprovadoTotalCentavos: number };

const SITUACOES: { valor: SituacaoMeta; rotulo: string }[] = [
  { valor: "nao_iniciado", rotulo: "Não iniciada" },
  { valor: "em_execucao", rotulo: "Em execução" },
  { valor: "concluido", rotulo: "Concluída" },
];
const rotuloSituacao = (s: SituacaoMeta) => SITUACOES.find((x) => x.valor === s)?.rotulo ?? s;

// Formatação com casas decimais (pesos e percentuais) — o `numero()` do lib não fixa o máximo
const decimal = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Quanto da etapa foi cumprido (0–100): o executado pode passar do previsto, a etapa não. */
const conclusaoEtapa = (e: Etapa) =>
  e.quantidadePrevista > 0 ? Math.min(Math.max(e.executado, 0) / e.quantidadePrevista, 1) * 100 : 0;

type Edicao =
  | { tipo: "meta"; meta?: Meta; numeroSugerido: number }
  | { tipo: "indicador"; metaId: string; indicador?: Indicador; ordemSugerida: number }
  | { tipo: "etapa"; indicador: Indicador; etapa?: Etapa }
  | { tipo: "quantidade"; etapa: Etapa };

type Exclusao =
  | { tipo: "meta"; meta: Meta }
  | { tipo: "indicador"; indicador: Indicador }
  | { tipo: "etapa"; etapa: Etapa };

function BarraProgresso({ valor, rotulo, className }: { valor: number; rotulo: string; className?: string }) {
  const limitado = Math.min(Math.max(valor, 0), 100);
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(limitado * 10) / 10}
      aria-valuetext={pct(limitado)}
      className={cn("h-2 w-full overflow-hidden bg-muted", className)}
    >
      <div
        className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${limitado}%` }}
      />
    </div>
  );
}

export default function MetasPage() {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  const projetos = useProjetos();
  const [projetoUrl, setProjetoUrl] = useQueryState("projetoId", parseAsString.withDefault(""));
  const projetoId = projetoUrl || projetos.unico || "";
  const projeto = projetos.itens.find((p) => p.id === projetoId);
  const encerrado = projeto?.situacao === "encerrado";
  // Projeto encerrado não aceita alteração nas metas (a API recusa)
  const gestor = podeGerenciar("gestor") && !!projeto && !encerrado;

  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const metas = useQuery({
    queryKey: ["metas", { projetoId }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Meta[], ResumoMetas>>("/metas", { query: { projetoId }, signal }),
    enabled: !!projetoId,
  });
  const lista = metas.data?.data ?? [];
  const resumo = metas.data?.meta;
  const somaPesos = lista.reduce((soma, m) => soma + m.peso, 0);
  const numeroSugerido = lista.reduce((maior, m) => Math.max(maior, m.numero), 0) + 1;

  const excluirMutation = useMutation({
    mutationFn: (alvo: Exclusao) =>
      fetchData(
        alvo.tipo === "meta"
          ? `/metas/${alvo.meta.id}`
          : alvo.tipo === "indicador"
            ? `/metas/indicadores/${alvo.indicador.id}`
            : `/metas/etapas/${alvo.etapa.id}`,
        { method: "DELETE" },
      ),
    onSuccess: (_, alvo) => {
      toast.success(
        alvo.tipo === "meta"
          ? "Meta excluída."
          : alvo.tipo === "indicador"
            ? "Indicador excluído."
            : "Etapa excluída.",
      );
      setExclusao(null);
      queryClient.invalidateQueries({ queryKey: ["metas"] });
    },
    onError: (erro) => {
      // 409: a meta tem produções ou lançamentos ligados — a mensagem da API já diz o que fazer
      if ((erro as ErroApi).status === 409) setExclusao(null);
      toast.error(mensagemDeErro(erro, "Não foi possível excluir."));
    },
  });

  const confirmacao: Confirmacao | null = exclusao
    ? {
        ...(exclusao.tipo === "meta"
          ? {
              titulo: `Excluir a meta ${exclusao.meta.numero}?`,
              descricao:
                "Os indicadores e as etapas dela também são excluídos. Não é possível excluir uma meta que já tenha produções ou lançamentos financeiros ligados a ela.",
            }
          : exclusao.tipo === "indicador"
            ? {
                titulo: "Excluir o indicador?",
                descricao: (
                  <>
                    <strong>{exclusao.indicador.descricao}</strong> e todas as etapas dele saem da meta, e o
                    percentual da meta é recalculado.
                  </>
                ),
              }
            : {
                titulo: "Excluir a etapa?",
                descricao: (
                  <>
                    <strong>{exclusao.etapa.descricao}</strong> sai do indicador, e o percentual da meta é
                    recalculado.
                  </>
                ),
              }),
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(exclusao),
        focoAposConfirmar: listaRef,
      }
    : null;

  const cabecalhoSheet = !edicao
    ? null
    : edicao.tipo === "meta"
      ? {
          titulo: edicao.meta ? `Editar meta ${edicao.meta.numero}` : "Nova meta",
          descricao: "Os pesos das metas do projeto devem somar 100.",
        }
      : edicao.tipo === "indicador"
        ? {
            titulo: edicao.indicador ? "Editar indicador" : "Novo indicador",
            descricao: "O indicador agrupa as etapas que medem a meta.",
          }
        : edicao.tipo === "etapa"
          ? {
              titulo: edicao.etapa ? "Editar etapa" : "Nova etapa",
              descricao: `Indicador: ${edicao.indicador.descricao}`,
            }
          : {
              titulo: "Registrar executado",
              descricao: edicao.etapa.descricao,
            };

  return (
    <PageLayout
      title="Metas"
      actions={
        gestor && (
          <Button onClick={() => setEdicao({ tipo: "meta", numeroSugerido })}>
            <Plus className="size-4" /> Nova meta
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Seletor
          className="h-9 w-full sm:w-96"
          aria-label="Projeto"
          placeholder="Escolha o projeto…"
          vazio="Nenhum projeto encontrado."
          opcoes={projetos.opcoes}
          valor={projetoId || null}
          disabled={projetos.isPending}
          onValorChange={(valor) => void setProjetoUrl(valor)}
        />
        {encerrado && podeGerenciar("gestor") && (
          <p className="text-sm text-muted-foreground">
            Projeto encerrado: as metas não podem mais ser alteradas.
          </p>
        )}
      </div>

      {!projetoId ? (
        projetos.isPending ? (
          <div className="grid gap-3" aria-busy>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : projetos.isError ? (
          <EmptyState
            icon={Target}
            title={
              ehSemPermissao(projetos.error)
                ? "Você não tem permissão para ver isto."
                : "Não foi possível carregar os projetos."
            }
            action={
              !ehSemPermissao(projetos.error) && (
                <Button variant="outline" onClick={() => projetos.refetch()}>
                  Tentar novamente
                </Button>
              )
            }
          />
        ) : projetos.itens.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhum projeto disponível"
            description="As metas aparecem aqui quando você fizer parte da equipe de um projeto."
          />
        ) : (
          <EmptyState
            icon={Target}
            title="Escolha um projeto"
            description="As metas, os indicadores e o andamento de cada etapa são de cada projeto."
          />
        )
      ) : metas.isPending ? (
        <div className="grid gap-3" aria-busy>
          <span role="status" className="sr-only">
            Carregando…
          </span>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : metas.isError ? (
        <EmptyState
          icon={Target}
          title={
            ehSemPermissao(metas.error)
              ? "Você não tem permissão para ver isto."
              : (metas.error as ErroApi).status === 404
                ? "Projeto não encontrado"
                : "Erro ao carregar as metas."
          }
          action={
            !ehSemPermissao(metas.error) &&
            (metas.error as ErroApi).status !== 404 && (
              <Button variant="outline" onClick={() => metas.refetch()}>
                Tentar novamente
              </Button>
            )
          }
        />
      ) : (
        <div ref={listaRef} tabIndex={-1} className="space-y-6 outline-none">
          <section aria-labelledby="resumo-titulo" className="space-y-3 border p-4">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h2 id="resumo-titulo" className="text-sm text-muted-foreground">
                  Execução do projeto
                </h2>
                <p className="text-3xl font-semibold tabular-nums">{pct(resumo?.percentualProjeto ?? 0)}</p>
              </div>
              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Valor aprovado</dt>
                  <dd className="font-medium tabular-nums">
                    {moeda(resumo?.valorAprovadoTotalCentavos ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Metas</dt>
                  <dd className="font-medium tabular-nums">{numero(lista.length)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Soma dos pesos</dt>
                  <dd className="font-medium tabular-nums">{decimal(somaPesos)}</dd>
                </div>
              </dl>
            </div>
            <BarraProgresso
              valor={resumo?.percentualProjeto ?? 0}
              rotulo="Execução do projeto"
              className="h-3"
            />
            {somaPesos > 100 && (
              <p className="flex items-start gap-2 border border-dashed p-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  A soma dos pesos das metas é {decimal(somaPesos)} — o esperado é 100. O percentual do
                  projeto fica distorcido até os pesos serem ajustados.
                </span>
              </p>
            )}
          </section>

          {lista.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Nenhuma meta cadastrada neste projeto"
              description={
                gestor ? "Comece pela meta 1 e depois inclua os indicadores e as etapas." : undefined
              }
              action={
                gestor && (
                  <Button variant="outline" onClick={() => setEdicao({ tipo: "meta", numeroSugerido })}>
                    <Plus className="size-4" /> Nova meta
                  </Button>
                )
              }
            />
          ) : (
            lista.map((meta) => (
              <section key={meta.id} aria-labelledby={`meta-${meta.id}`} className="border">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id={`meta-${meta.id}`} className="text-lg font-semibold">
                        Meta {meta.numero}
                      </h2>
                      <Badge variant={meta.situacao === "concluido" ? "default" : "secondary"}>
                        {rotuloSituacao(meta.situacao)}
                      </Badge>
                    </div>
                    <p className="text-sm">{meta.descricao}</p>
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Peso</dt>
                        <dd className="tabular-nums">{decimal(meta.peso)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted-foreground">Valor aprovado</dt>
                        <dd className="tabular-nums">{moeda(meta.valorAprovadoCentavos)}</dd>
                      </div>
                    </dl>
                  </div>
                  {gestor && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEdicao({
                            tipo: "indicador",
                            metaId: meta.id,
                            ordemSugerida:
                              meta.indicadores.reduce((maior, i) => Math.max(maior, i.ordem), 0) + 1,
                          })
                        }
                      >
                        <Plus className="size-4" /> Indicador
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Editar meta"
                        aria-label={`Editar a meta ${meta.numero}`}
                        onClick={() => setEdicao({ tipo: "meta", meta, numeroSugerido })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Excluir meta"
                        aria-label={`Excluir a meta ${meta.numero}`}
                        onClick={() => setExclusao({ tipo: "meta", meta })}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 px-4 pb-4">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Concluído</span>
                    <span className="font-medium tabular-nums">{pct(meta.percentual)}</span>
                  </div>
                  <BarraProgresso valor={meta.percentual} rotulo={`Meta ${meta.numero} concluída`} />
                </div>

                {meta.indicadores.length === 0 ? (
                  <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
                    Nenhum indicador nesta meta ainda
                  </p>
                ) : (
                  meta.indicadores.map((indicador) => (
                    <div key={indicador.id} className="border-t">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2.5">
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium">{indicador.descricao}</h3>
                          <p className="text-xs text-muted-foreground">
                            Contribui com {pct(indicador.percentual)} da meta
                          </p>
                        </div>
                        {gestor && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEdicao({ tipo: "etapa", indicador })}
                              aria-label={`Nova etapa em ${indicador.descricao}`}
                            >
                              <Plus className="size-4" /> Etapa
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Editar indicador"
                              aria-label={`Editar o indicador ${indicador.descricao}`}
                              onClick={() =>
                                setEdicao({ tipo: "indicador", metaId: meta.id, indicador, ordemSugerida: 0 })
                              }
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Excluir indicador"
                              aria-label={`Excluir o indicador ${indicador.descricao}`}
                              onClick={() => setExclusao({ tipo: "indicador", indicador })}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Larguras fixas: as tabelas de todos os indicadores alinham as colunas entre si */}
                      <Table
                        aria-label={`Etapas do indicador ${indicador.descricao}`}
                        className="table-fixed"
                      >
                        <TableHeader>
                          <TableRow>
                            <TableHead>Etapa</TableHead>
                            <TableHead className="hidden w-24 text-right sm:table-cell">Previsto</TableHead>
                            <TableHead className="hidden w-32 sm:table-cell">Executado</TableHead>
                            <TableHead className="hidden w-20 text-right md:table-cell">Peso</TableHead>
                            <TableHead className="w-20 sm:w-40">%</TableHead>
                            {gestor && <TableHead className="w-28 text-right">Ações</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {indicador.etapas.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={gestor ? 6 : 5}
                                className="py-4 text-center text-muted-foreground"
                              >
                                Nenhuma etapa neste indicador ainda
                              </TableCell>
                            </TableRow>
                          ) : (
                            indicador.etapas.map((etapa) => {
                              const conclusao = conclusaoEtapa(etapa);
                              const apuracao =
                                etapa.apuracao === "automatica" ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Zap className="size-3" aria-hidden /> Automático
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Hand className="size-3" aria-hidden /> Manual
                                  </span>
                                );
                              return (
                                <TableRow key={etapa.id}>
                                  <TableCell className="break-words whitespace-normal">
                                    <div className="flex flex-col gap-0.5">
                                      <span>{etapa.descricao}</span>
                                      {/* No celular o executado vem aqui (a coluna fica escondida) */}
                                      <span className="flex flex-wrap items-center gap-x-2 sm:hidden">
                                        <span className="text-xs tabular-nums">
                                          {numero(etapa.executado)} / {numero(etapa.quantidadePrevista)}
                                        </span>
                                        {apuracao}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                    {numero(etapa.quantidadePrevista)}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="tabular-nums">{numero(etapa.executado)}</span>
                                      {apuracao}
                                    </div>
                                  </TableCell>
                                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                                    {decimal(etapa.peso)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="grid gap-1">
                                      <span className="text-xs tabular-nums">{pct(conclusao)}</span>
                                      <BarraProgresso
                                        valor={conclusao}
                                        rotulo={`Etapa ${etapa.descricao}`}
                                        className="h-1.5"
                                      />
                                    </div>
                                  </TableCell>
                                  {gestor && (
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-1">
                                        {etapa.apuracao === "manual" && (
                                          <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            title="Registrar executado"
                                            aria-label={`Registrar o executado de ${etapa.descricao}`}
                                            onClick={() => setEdicao({ tipo: "quantidade", etapa })}
                                          >
                                            <ClipboardPen className="size-4" />
                                          </Button>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          title="Editar etapa"
                                          aria-label={`Editar a etapa ${etapa.descricao}`}
                                          onClick={() => setEdicao({ tipo: "etapa", indicador, etapa })}
                                        >
                                          <Pencil className="size-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          title="Excluir etapa"
                                          aria-label={`Excluir a etapa ${etapa.descricao}`}
                                          onClick={() => setExclusao({ tipo: "etapa", etapa })}
                                        >
                                          <Trash2 className="size-4 text-destructive" />
                                        </Button>
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
                  ))
                )}
              </section>
            ))
          )}
        </div>
      )}

      <Sheet open={edicao !== null} onOpenChange={(aberto) => !aberto && setEdicao(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          {cabecalhoSheet && (
            <SheetHeader className="border-b">
              <SheetTitle>{cabecalhoSheet.titulo}</SheetTitle>
              <SheetDescription>{cabecalhoSheet.descricao}</SheetDescription>
            </SheetHeader>
          )}
          {edicao?.tipo === "meta" && (
            <FormularioMeta
              key={edicao.meta?.id ?? "nova"}
              projetoId={projetoId}
              registro={edicao.meta}
              numeroSugerido={edicao.numeroSugerido}
              onFechar={() => setEdicao(null)}
            />
          )}
          {edicao?.tipo === "indicador" && (
            <FormularioIndicador
              key={edicao.indicador?.id ?? "novo"}
              metaId={edicao.metaId}
              registro={edicao.indicador}
              ordemSugerida={edicao.ordemSugerida}
              onFechar={() => setEdicao(null)}
            />
          )}
          {edicao?.tipo === "etapa" && (
            <FormularioEtapa
              key={edicao.etapa?.id ?? "nova"}
              indicadorId={edicao.indicador.id}
              registro={edicao.etapa}
              onFechar={() => setEdicao(null)}
            />
          )}
          {edicao?.tipo === "quantidade" && (
            <FormularioQuantidade
              key={edicao.etapa.id}
              etapa={edicao.etapa}
              onFechar={() => setEdicao(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setExclusao(null)} />
    </PageLayout>
  );
}

// ─── Formulários ──────────────────────────────────────────────────────────

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

function RodapeFormulario({
  pendente,
  criando,
  onFechar,
}: {
  pendente: boolean;
  criando: boolean;
  onFechar: () => void;
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
        ) : criando ? (
          "Criar"
        ) : (
          "Salvar"
        )}
      </Button>
    </SheetFooter>
  );
}

const pesoSchema = z
  .number({ error: "Informe o peso" })
  .min(0, "O peso vai de 0 a 100")
  .max(100, "O peso vai de 0 a 100");

const schemaMeta = z.object({
  numero: z
    .number({ error: "Informe o número" })
    .int("Use um número inteiro")
    .min(1, "O número deve ser maior que zero")
    .max(32767, "Número muito grande"),
  descricao: z.string().trim().min(1, "Informe a descrição").max(2000, "No máximo 2000 caracteres"),
  valorAprovado: z
    .string()
    .transform((v) => centavosDeTexto(v) ?? 0)
    .refine((v) => Number.isFinite(v) && v >= 0, "Valor inválido (ex.: 1.250.000,00)"),
  peso: pesoSchema,
  situacao: z.enum(["nao_iniciado", "em_execucao", "concluido"]),
});
type FormMeta = z.input<typeof schemaMeta>;
type FormMetaSaida = z.output<typeof schemaMeta>;

function FormularioMeta({
  projetoId,
  registro,
  numeroSugerido,
  onFechar,
}: {
  projetoId: string;
  registro?: Meta;
  numeroSugerido: number;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormMeta, unknown, FormMetaSaida>({
    resolver: zodResolver(schemaMeta),
    defaultValues: {
      numero: registro?.numero ?? numeroSugerido,
      descricao: registro?.descricao ?? "",
      valorAprovado: textoDeCentavos(registro?.valorAprovadoCentavos),
      peso: registro?.peso ?? 0,
      situacao: registro?.situacao ?? "nao_iniciado",
    },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: ({ valorAprovado, ...dados }: FormMetaSaida) => {
      const body = { ...dados, valorAprovadoCentavos: valorAprovado };
      return registro
        ? fetchData<Envelope<Meta, { avisos?: string[] }>>(`/metas/${registro.id}`, { method: "PATCH", body })
        : fetchData<Envelope<Meta, { avisos?: string[] }>>("/metas", {
            method: "POST",
            body: { projetoId, ...body },
          });
    },
    onSuccess: (resposta) => {
      toast.success(registro ? "Meta atualizada." : "Meta criada.");
      for (const aviso of resposta.meta.avisos ?? []) toast.warning(aviso);
      queryClient.invalidateQueries({ queryKey: ["metas"] });
      onFechar();
    },
    onError: (erro) => {
      if ((erro as ErroApi).meta?.codigo === "META_DUPLICADA") {
        setError("numero", { type: "server", message: mensagemDeErro(erro) }, { shouldFocus: true });
        return;
      }
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a meta."));
    },
  });

  const campo = (nome: keyof FormMeta) => ({
    id: `meta-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `meta-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormMeta) =>
    errors[nome] && (
      <p id={`meta-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
        <ErrosApi erros={errosApi} />

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="meta-numero">Número</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              {...campo("numero")}
              {...register("numero", { valueAsNumber: true })}
            />
            {erro("numero")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="meta-peso">Peso (0 a 100)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              {...campo("peso")}
              {...register("peso", { valueAsNumber: true })}
            />
            {erro("peso")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="meta-descricao">Descrição</Label>
          <Textarea rows={4} maxLength={2000} {...campo("descricao")} {...register("descricao")} />
          {erro("descricao")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="meta-valorAprovado">Valor aprovado (R$)</Label>
          <Input
            inputMode="decimal"
            placeholder="1.250.000,00"
            {...campo("valorAprovado")}
            {...register("valorAprovado")}
          />
          {erro("valorAprovado")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="meta-situacao">Situação</Label>
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

      <RodapeFormulario pendente={salvar.isPending} criando={!registro} onFechar={onFechar} />
    </form>
  );
}

const schemaIndicador = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição").max(2000, "No máximo 2000 caracteres"),
  ordem: z
    .number({ error: "Informe a ordem" })
    .int("Use um número inteiro")
    .min(0, "Não pode ser negativa")
    .max(32767, "Número muito grande"),
});
type FormIndicador = z.infer<typeof schemaIndicador>;

function FormularioIndicador({
  metaId,
  registro,
  ordemSugerida,
  onFechar,
}: {
  metaId: string;
  registro?: Indicador;
  ordemSugerida: number;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormIndicador>({
    resolver: zodResolver(schemaIndicador),
    defaultValues: { descricao: registro?.descricao ?? "", ordem: registro?.ordem ?? ordemSugerida },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (body: FormIndicador) =>
      registro
        ? fetchData(`/metas/indicadores/${registro.id}`, { method: "PATCH", body })
        : fetchData(`/metas/${metaId}/indicadores`, { method: "POST", body }),
    onSuccess: () => {
      toast.success(registro ? "Indicador atualizado." : "Indicador incluído.");
      queryClient.invalidateQueries({ queryKey: ["metas"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o indicador."));
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
        <ErrosApi erros={errosApi} />

        <div className="grid gap-1.5">
          <Label htmlFor="indicador-descricao">Descrição</Label>
          <Textarea
            id="indicador-descricao"
            rows={3}
            maxLength={2000}
            aria-invalid={!!errors.descricao}
            aria-describedby={errors.descricao ? "indicador-descricao-erro" : undefined}
            {...register("descricao")}
          />
          {errors.descricao && (
            <p id="indicador-descricao-erro" role="alert" className="text-xs text-destructive">
              {errors.descricao.message}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="indicador-ordem">Ordem na meta</Label>
          <Input
            id="indicador-ordem"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="w-32"
            aria-invalid={!!errors.ordem}
            aria-describedby={errors.ordem ? "indicador-ordem-erro" : "indicador-ordem-dica"}
            {...register("ordem", { valueAsNumber: true })}
          />
          {errors.ordem ? (
            <p id="indicador-ordem-erro" role="alert" className="text-xs text-destructive">
              {errors.ordem.message}
            </p>
          ) : (
            <p id="indicador-ordem-dica" className="text-xs text-muted-foreground">
              Números menores aparecem primeiro.
            </p>
          )}
        </div>
      </div>

      <RodapeFormulario pendente={salvar.isPending} criando={!registro} onFechar={onFechar} />
    </form>
  );
}

const schemaEtapa = z
  .object({
    descricao: z.string().trim().min(1, "Informe a descrição").max(2000, "No máximo 2000 caracteres"),
    quantidadePrevista: z
      .number({ error: "Informe a quantidade prevista" })
      .int("Use um número inteiro")
      .min(1, "A quantidade prevista deve ser maior que zero"),
    peso: pesoSchema,
    apuracao: z.enum(["automatica", "manual"]),
    chave: z.string(),
    quantidadeManual: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine(
        (v) => v === null || (Number.isInteger(v) && v >= 0),
        "Informe um número inteiro, zero ou mais",
      ),
  })
  .refine((v) => v.apuracao === "manual" || v.chave, {
    message: "Escolha o que conta como executado",
    path: ["chave"],
  });
type FormEtapa = z.input<typeof schemaEtapa>;
type FormEtapaSaida = z.output<typeof schemaEtapa>;

function FormularioEtapa({
  indicadorId,
  registro,
  onFechar,
}: {
  indicadorId: string;
  registro?: Etapa;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const chaves = useQuery({
    queryKey: ["metas", "chaves"],
    queryFn: ({ signal }) => fetchData<Envelope<ChaveApuracao[]>>("/metas/chaves", { signal }),
  });

  const form = useForm<FormEtapa, unknown, FormEtapaSaida>({
    resolver: zodResolver(schemaEtapa),
    defaultValues: {
      descricao: registro?.descricao ?? "",
      quantidadePrevista: registro?.quantidadePrevista ?? 1,
      peso: registro?.peso ?? 0,
      apuracao: registro?.apuracao ?? "automatica",
      chave: registro?.chave ?? "",
      quantidadeManual: registro?.quantidadeManual != null ? String(registro.quantidadeManual) : "",
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;
  const apuracao = useWatch({ control, name: "apuracao" });

  const salvar = useMutation({
    mutationFn: (d: FormEtapaSaida) => {
      const automatica = d.apuracao === "automatica";
      const body = {
        descricao: d.descricao,
        quantidadePrevista: d.quantidadePrevista,
        peso: d.peso,
        apuracao: d.apuracao,
        chave: automatica ? d.chave : null,
        quantidadeManual: automatica ? null : d.quantidadeManual,
      };
      return registro
        ? fetchData(`/metas/etapas/${registro.id}`, { method: "PATCH", body })
        : fetchData(`/metas/indicadores/${indicadorId}/etapas`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(registro ? "Etapa atualizada." : "Etapa incluída.");
      queryClient.invalidateQueries({ queryKey: ["metas"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a etapa."));
    },
  });

  const campo = (nome: keyof FormEtapa) => ({
    id: `etapa-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `etapa-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormEtapa) =>
    errors[nome] && (
      <p id={`etapa-${nome}-erro`} role="alert" className="text-xs text-destructive">
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
        <ErrosApi erros={errosApi} />

        <div className="grid gap-1.5">
          <Label htmlFor="etapa-descricao">Descrição</Label>
          <Textarea rows={3} maxLength={2000} {...campo("descricao")} {...register("descricao")} />
          {erro("descricao")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="etapa-quantidadePrevista">Previsto</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              {...campo("quantidadePrevista")}
              {...register("quantidadePrevista", { valueAsNumber: true })}
            />
            {erro("quantidadePrevista")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="etapa-peso">Peso na meta (0 a 100)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              {...campo("peso")}
              {...register("peso", { valueAsNumber: true })}
            />
            {erro("peso")}
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Como apurar o executado</legend>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" value="automatica" className="mt-1" {...register("apuracao")} />
              <span>
                Automático
                <span className="block text-xs text-muted-foreground">
                  Contado pelos registros do sistema
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" value="manual" className="mt-1" {...register("apuracao")} />
              <span>
                Manual
                <span className="block text-xs text-muted-foreground">
                  A equipe informa a quantidade executada
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {apuracao === "automatica" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="etapa-chave">O que conta como executado</Label>
            <NativeSelect
              className="w-full"
              disabled={chaves.isPending}
              {...campo("chave")}
              {...register("chave")}
            >
              <NativeSelectOption value="">
                {chaves.isPending ? "Carregando…" : "Selecione…"}
              </NativeSelectOption>
              {(chaves.data?.data ?? []).map((c) => (
                <NativeSelectOption key={c.chave} value={c.chave}>
                  {c.descricao}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {erro("chave")}
            {chaves.isError && (
              <p role="alert" className="text-xs text-destructive">
                Não foi possível carregar as opções.{" "}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => chaves.refetch()}
                >
                  Tentar novamente
                </Button>
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="etapa-quantidadeManual">Executado até agora (opcional)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className="w-40"
              {...campo("quantidadeManual")}
              {...register("quantidadeManual")}
            />
            {erro("quantidadeManual")}
          </div>
        )}
      </div>

      <RodapeFormulario pendente={salvar.isPending} criando={!registro} onFechar={onFechar} />
    </form>
  );
}

const schemaQuantidade = z.object({
  quantidadeManual: z
    .number({ error: "Informe a quantidade" })
    .int("Use um número inteiro")
    .min(0, "A quantidade não pode ser negativa"),
});
type FormQuantidade = z.infer<typeof schemaQuantidade>;

function FormularioQuantidade({ etapa, onFechar }: { etapa: Etapa; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const form = useForm<FormQuantidade>({
    resolver: zodResolver(schemaQuantidade),
    defaultValues: { quantidadeManual: etapa.quantidadeManual ?? 0 },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: (body: FormQuantidade) =>
      fetchData(`/metas/etapas/${etapa.id}/quantidade`, { method: "PUT", body }),
    onSuccess: () => {
      toast.success("Executado registrado.");
      queryClient.invalidateQueries({ queryKey: ["metas"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível registrar o executado."));
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
        <ErrosApi erros={errosApi} />

        <div className="grid gap-1.5">
          <Label htmlFor="quantidade-quantidadeManual">Quantidade executada</Label>
          <Input
            id="quantidade-quantidadeManual"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="w-40"
            aria-invalid={!!errors.quantidadeManual}
            aria-describedby={
              errors.quantidadeManual
                ? "quantidade-quantidadeManual-erro"
                : "quantidade-quantidadeManual-dica"
            }
            {...register("quantidadeManual", { valueAsNumber: true })}
          />
          {errors.quantidadeManual ? (
            <p id="quantidade-quantidadeManual-erro" role="alert" className="text-xs text-destructive">
              {errors.quantidadeManual.message}
            </p>
          ) : (
            <p id="quantidade-quantidadeManual-dica" className="text-xs text-muted-foreground">
              Previsto: {numero(etapa.quantidadePrevista)}. Pode passar do previsto — a etapa conta no máximo
              100%.
            </p>
          )}
        </div>
      </div>

      <RodapeFormulario pendente={salvar.isPending} criando={false} onFechar={onFechar} />
    </form>
  );
}
