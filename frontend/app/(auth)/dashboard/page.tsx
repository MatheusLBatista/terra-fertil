"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { ArrowRight, ClipboardList, Plus } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Seletor } from "@/components/seletor";
import { useProjetos } from "@/hooks/use-projetos";
import { ehSemPermissao, fetchData } from "@/lib/fetchData";
import { dataCalendario, hojeISO, moeda, numero } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Gestao = components["schemas"]["DashboardGestao"];
type Tecnico = components["schemas"]["DashboardTecnico"];
type VisitaResumo = components["schemas"]["VisitaResumo"];
type Meta = components["schemas"]["Meta"];
type SituacaoEntrega = Gestao["funil"]["situacoes"][number]["situacao"];

const TIPOS_VISITA: Record<VisitaResumo["tipo"], string> = {
  inicial_associacao: "Visita inicial",
  diagnostico_propriedade: "Diagnóstico",
  assistencia_tecnica: "Assistência técnica",
  acompanhamento: "Acompanhamento",
};
/** Etapas do funil na ordem do processo (cancelado fica fora). */
const ETAPAS_ENTREGA: { valor: SituacaoEntrega; rotulo: string }[] = [
  { valor: "demandado", rotulo: "Demandado" },
  { valor: "aprovado", rotulo: "Aprovado" },
  { valor: "em_compra", rotulo: "Em compra" },
  { valor: "comprado", rotulo: "Comprado" },
  { valor: "entregue", rotulo: "Entregue" },
];
const SITUACOES_DOCUMENTO: Record<string, string> = {
  pendente: "Pendente",
  recebido: "Recebido",
  validado: "Validado",
  rejeitado: "Rejeitado",
};

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const proporcao = (parte: number, todo: number) => (todo > 0 ? Math.min(100, (parte / todo) * 100) : 0);

/**
 * Duas visões: o técnico vê o trabalho dele (visitas e recomendações); os
 * demais papéis, a gestão do projeto escolhido. O backend limita cada uma ao
 * escopo de projetos do usuário.
 */
export default function DashboardPage() {
  const { papel, carregando } = usePapel();
  if (carregando) {
    return (
      <PageLayout title="Dashboard">
        <span role="status" className="sr-only">
          Carregando…
        </span>
        <Skeleton className="h-28 w-full" />
      </PageLayout>
    );
  }
  return papel === "tecnico" ? <DashboardTecnico /> : <DashboardGestao />;
}

// ─── Peças comuns ────────────────────────────────────────────────────────────

/** Número grande com rótulo e complemento; a barra é opcional (e sempre acompanha o número). */
function Indicador({
  rotulo,
  valor,
  complemento,
  progresso,
}: {
  rotulo: string;
  valor: string;
  complemento: string;
  progresso?: number;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{rotulo}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{valor}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {progresso !== undefined && <Barra valor={progresso} rotulo={`${rotulo}: ${pct(progresso)}`} />}
        <p className="text-muted-foreground">{complemento}</p>
      </CardContent>
    </Card>
  );
}

function Barra({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor)}
      className="h-2 w-full bg-muted"
    >
      <div className="h-full bg-primary" style={{ width: `${valor}%` }} />
    </div>
  );
}

/** Card de lista curta: título com o total, itens com link e "ver todos". */
function Pendencias<T>({
  titulo,
  descricao,
  total,
  itens,
  vazio,
  verTodos,
  chave,
  renderItem,
}: {
  titulo: string;
  descricao: string;
  total: number;
  itens: T[];
  vazio: string;
  verTodos?: string;
  chave: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {titulo}
          <Badge variant={total > 0 ? "secondary" : "outline"}>{numero(total)}</Badge>
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
        {verTodos && total > itens.length && (
          <CardAction>
            <Button variant="link" size="sm" nativeButton={false} render={<Link href={verTodos} />}>
              Ver todos <ArrowRight className="size-3.5" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-muted-foreground">{vazio}</p>
        ) : (
          <ul className="divide-y border-y">
            {itens.map((item) => (
              <li key={chave(item)} className="py-2">
                {renderItem(item)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Uma visita na lista: tipo + onde (link) e data/projeto. */
function LinhaVisita({ v, extra }: { v: VisitaResumo; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Link href={`/visitas/${v.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
        {TIPOS_VISITA[v.tipo]} — <span className="wrap-anywhere">{v.onde}</span>
      </Link>
      <span className="text-muted-foreground tabular-nums">
        {dataCalendario(v.data)} · {v.projetoSigla} · {v.tecnicoNome}
      </span>
      {extra}
    </div>
  );
}

function Carregando() {
  return (
    <div className="grid gap-4" aria-busy>
      <span role="status" className="sr-only">
        Carregando…
      </span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function Erro({ erro, tentar }: { erro: unknown; tentar: () => void }) {
  return (
    <p className="border py-6 text-center text-sm text-muted-foreground">
      {ehSemPermissao(erro) ? (
        "Você não tem permissão para ver isto."
      ) : (
        <>
          Erro ao carregar o dashboard.{" "}
          <Button variant="link" size="sm" onClick={tentar}>
            Tentar novamente
          </Button>
        </>
      )}
    </p>
  );
}

// ─── Gestão ──────────────────────────────────────────────────────────────────

function DashboardGestao() {
  const projetos = useProjetos();
  const [projetoUrl, setProjetoUrl] = useQueryState("projetoId", parseAsString.withDefault(""));
  // Sem projeto na URL: o mais recente (a lista vem por início, decrescente)
  const projetoId = projetoUrl || projetos.itens[0]?.id || "";
  const hoje = hojeISO();

  const painel = useQuery({
    queryKey: ["dashboard", "gestao", { projetoId, hoje }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Gestao>>("/dashboard/gestao", { query: { projetoId, hoje }, signal }),
    enabled: !!projetoId,
  });
  // Mesma consulta da tela de metas (mesma key): a apuração já vem calculada
  const metas = useQuery({
    queryKey: ["metas", { projetoId }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Meta[], { percentualProjeto: number }>>("/metas", { query: { projetoId }, signal }),
    enabled: !!projetoId,
  });
  const d = painel.data?.data;

  return (
    <PageLayout
      title="Dashboard"
      actions={
        <Seletor
          className="h-9 w-full sm:w-72"
          aria-label="Projeto"
          placeholder="Escolha o projeto…"
          vazio="Nenhum projeto encontrado."
          opcoes={projetos.opcoes}
          valor={projetoId}
          disabled={projetos.isPending}
          onValorChange={(v) => void setProjetoUrl(v)}
        />
      }
    >
      {!projetos.isPending && projetos.itens.length === 0 ? (
        <p className="border py-6 text-center text-sm text-muted-foreground">
          Nenhum projeto disponível para você.
        </p>
      ) : painel.isPending || !d ? (
        painel.isError ? (
          <Erro erro={painel.error} tentar={() => painel.refetch()} />
        ) : (
          <Carregando />
        )
      ) : (
        <div className="grid gap-4">
          <section aria-label="Indicadores do projeto" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Visitas realizadas no mês"
              valor={numero(d.indicadores.visitasMes)}
              complemento={`${numero(d.indicadores.visitasMesAnterior)} no mês anterior`}
            />
            <Indicador
              rotulo="Entregas realizadas"
              valor={`${numero(d.indicadores.entregasEntregues)} de ${numero(d.indicadores.entregasDemandadas)}`}
              complemento="Entregues, do total demandado (sem as canceladas)"
              progresso={proporcao(d.indicadores.entregasEntregues, d.indicadores.entregasDemandadas)}
            />
            <Indicador
              rotulo="Associações visitadas"
              valor={`${numero(d.indicadores.associacoesVisitadas)} de ${numero(d.indicadores.associacoes)}`}
              complemento="Com visita inicial realizada, das que participam do projeto"
              progresso={proporcao(d.indicadores.associacoesVisitadas, d.indicadores.associacoes)}
            />
            <Indicador
              rotulo="Execução financeira"
              valor={pct(proporcao(d.indicadores.gastoCentavos, d.indicadores.liberadoCentavos))}
              complemento={`${moeda(d.indicadores.gastoCentavos)} gastos de ${moeda(d.indicadores.liberadoCentavos)} liberados`}
              progresso={proporcao(d.indicadores.gastoCentavos, d.indicadores.liberadoCentavos)}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Progresso das metas</CardTitle>
                <CardDescription>
                  {metas.data
                    ? `Projeto ${pct(metas.data.meta.percentualProjeto)} concluído — apuração automática dos indicadores.`
                    : "Apuração automática dos indicadores de cada meta."}
                </CardDescription>
                <CardAction>
                  <Button
                    variant="link"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/metas?projetoId=${projetoId}`} />}
                  >
                    Metas <ArrowRight className="size-3.5" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {metas.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : metas.isError ? (
                  <p className="text-muted-foreground">
                    {ehSemPermissao(metas.error)
                      ? "Você não tem permissão para ver as metas."
                      : "Erro ao carregar as metas."}
                  </p>
                ) : metas.data.data.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma meta cadastrada neste projeto.</p>
                ) : (
                  <ul className="grid gap-3">
                    {metas.data.data.map((m) => (
                      <li key={m.id} className="grid gap-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="line-clamp-2">
                            <span className="font-medium">Meta {m.numero}</span> — {m.descricao}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">{pct(m.percentual)}</span>
                        </div>
                        <Barra valor={m.percentual} rotulo={`Meta ${m.numero}: ${pct(m.percentual)}`} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Funil das entregas</CardTitle>
                <CardDescription>
                  Onde está cada entrega do projeto, da demanda ao termo assinado.
                </CardDescription>
                <CardAction>
                  <Button
                    variant="link"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/entregas?projetoId=${projetoId}`} />}
                  >
                    Entregas <ArrowRight className="size-3.5" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Funil funil={d.funil} />
              </CardContent>
            </Card>
          </div>

          <section aria-label="Pendências" className="grid gap-4 lg:grid-cols-2">
            <Pendencias
              titulo="Documentos de associações"
              descricao="Pendentes, rejeitados ou vencendo nos próximos 30 dias."
              {...d.pendencias.documentos}
              vazio="Nenhum documento pendente."
              chave={(x) => x.id}
              renderItem={(x) => (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/associacoes/${x.associacaoId}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {x.associacaoSigla} — {x.tipoDocumento}
                  </Link>
                  <span className="text-muted-foreground">
                    {SITUACOES_DOCUMENTO[x.situacao] ?? x.situacao}
                    {x.validade && ` · vence ${dataCalendario(x.validade)}`}
                  </span>
                </div>
              )}
            />
            <Pendencias
              titulo="Entregas sem termo assinado"
              descricao="Já entregues, sem a assinatura do termo de uso."
              {...d.pendencias.entregasSemAssinatura}
              vazio="Todas as entregas têm o termo assinado."
              verTodos={`/entregas?projetoId=${projetoId}&situacao=entregue`}
              chave={(x) => x.id}
              renderItem={(x) => (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium wrap-anywhere">
                    {x.itemDescricao} — {x.associacaoSigla}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{dataCalendario(x.dataEntrega)}</span>
                </div>
              )}
            />
            <Pendencias
              titulo="Visitas sem assinatura"
              descricao="Acompanhamentos e assistências realizados que ainda não foram assinados."
              {...d.pendencias.visitasSemAssinatura}
              vazio="Nenhuma visita esperando assinatura."
              chave={(x) => x.id}
              renderItem={(x) => <LinhaVisita v={x} />}
            />
            <Pendencias
              titulo="Recomendações vencidas"
              descricao="Prazo passado e ainda pendentes ou em andamento."
              {...d.pendencias.recomendacoesVencidas}
              vazio="Nenhuma recomendação vencida."
              verTodos={`/recomendacoes?projetoId=${projetoId}`}
              chave={(x) => x.id}
              renderItem={(x) => (
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/visitas/${x.visitaId}`}
                    className="line-clamp-2 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {x.descricao}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    {x.onde} · prazo {dataCalendario(x.prazo)}
                  </span>
                </div>
              )}
            />
          </section>
        </div>
      )}
    </PageLayout>
  );
}

/** Barras horizontais com o número ao lado (a barra só reforça o número). */
function Funil({ funil }: { funil: Gestao["funil"] }) {
  const total = (s: SituacaoEntrega) => funil.situacoes.find((x) => x.situacao === s)?.total ?? 0;
  const etapas = [
    ...ETAPAS_ENTREGA.map((e) => ({ rotulo: e.rotulo, total: total(e.valor) })),
    { rotulo: "Termo assinado", total: funil.termoAssinado },
  ];
  const maior = Math.max(1, ...etapas.map((e) => e.total));
  const canceladas = total("cancelado");
  return (
    <div className="grid gap-2">
      <dl className="grid gap-2">
        {etapas.map((e) => (
          <div key={e.rotulo} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2">
            <dt>{e.rotulo}</dt>
            <dd className="contents">
              <div className="h-3 bg-muted" aria-hidden>
                <div className="h-full bg-primary" style={{ width: `${(e.total / maior) * 100}%` }} />
              </div>
              <span className="text-right font-medium tabular-nums">{numero(e.total)}</span>
            </dd>
          </div>
        ))}
      </dl>
      {canceladas > 0 && (
        <p className="text-muted-foreground">{numero(canceladas)} cancelada(s), fora do funil.</p>
      )}
    </div>
  );
}

// ─── Técnico ─────────────────────────────────────────────────────────────────

function DashboardTecnico() {
  const hoje = hojeISO();
  const painel = useQuery({
    queryKey: ["dashboard", "tecnico", { hoje }],
    queryFn: ({ signal }) => fetchData<Envelope<Tecnico>>("/dashboard/tecnico", { query: { hoje }, signal }),
  });
  const d = painel.data?.data;

  return (
    <PageLayout
      title="Meu trabalho"
      actions={
        <Button nativeButton={false} render={<Link href="/visitas" />}>
          <Plus className="size-4" /> Registrar visita
        </Button>
      }
    >
      {painel.isError ? (
        <Erro erro={painel.error} tentar={() => painel.refetch()} />
      ) : !d ? (
        <Carregando />
      ) : (
        <div className="grid gap-4">
          <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Visitas realizadas no mês"
              valor={numero(d.realizadasMes)}
              complemento="Em que você foi o responsável ou esteve na equipe"
            />
            <Indicador
              rotulo="Próximas visitas"
              valor={numero(d.proximas.total)}
              complemento="Agendadas a partir de hoje"
            />
            <Indicador
              rotulo="Visitas atrasadas"
              valor={numero(d.atrasadas.total)}
              complemento="Agendadas com a data já passada — registre ou remarque"
            />
            <Indicador
              rotulo="Visitas para fechar"
              valor={numero(d.paraFechar.total)}
              complemento="Realizadas sem relato, foto ou assinatura"
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Pendencias
              titulo="Próximas visitas"
              descricao="Agendadas a partir de hoje, da mais próxima."
              {...d.proximas}
              vazio="Nenhuma visita agendada."
              verTodos="/visitas?situacao=agendada&sort=data:asc"
              chave={(x) => x.id}
              renderItem={(x) => <LinhaVisita v={x} />}
            />
            <Pendencias
              titulo="Visitas atrasadas"
              descricao="Agendadas para uma data que já passou."
              {...d.atrasadas}
              vazio="Nada atrasado."
              chave={(x) => x.id}
              renderItem={(x) => <LinhaVisita v={x} />}
            />
            <Pendencias
              titulo="Para fechar a documentação"
              descricao="Visitas realizadas que ainda precisam de relato, foto ou assinatura."
              {...d.paraFechar}
              vazio="Todas as visitas realizadas estão completas."
              chave={(x) => x.id}
              renderItem={(x) => (
                <LinhaVisita
                  v={x}
                  extra={
                    <span className="mt-1 flex flex-wrap gap-1">
                      {x.faltaRelato && <Badge variant="outline">Sem relato</Badge>}
                      {x.faltaFoto && <Badge variant="outline">Sem foto</Badge>}
                      {x.faltaAssinatura && <Badge variant="outline">Sem assinatura</Badge>}
                    </span>
                  }
                />
              )}
            />
            <Pendencias
              titulo="Recomendações a acompanhar"
              descricao="Dadas nas suas visitas, ainda abertas, com prazo nos próximos 15 dias."
              {...d.recomendacoes}
              vazio="Nenhuma recomendação com prazo próximo."
              chave={(x) => x.id}
              renderItem={(x) => (
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/visitas/${x.visitaId}`}
                    className="line-clamp-2 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {x.descricao}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2 text-muted-foreground tabular-nums">
                    {x.onde} · prazo {dataCalendario(x.prazo)}
                    {x.vencida && <Badge variant="destructive">Vencida</Badge>}
                  </span>
                </div>
              )}
            />
          </div>

          {d.proximas.total === 0 && d.atrasadas.total === 0 && d.paraFechar.total === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardList className="size-4" aria-hidden /> Tudo em dia por aqui.
            </p>
          )}
        </div>
      )}
    </PageLayout>
  );
}
