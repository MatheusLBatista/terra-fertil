"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ArrowLeft, CheckCheck, Plus, Trash2, Undo2 } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Seletor } from "@/components/seletor";
import { ehSemPermissao, fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { dataHora, numero, telefone } from "@/lib/formato";
import { usePapel } from "@/lib/papeis";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Evento = components["schemas"]["Evento"];
type Participante = components["schemas"]["EventoParticipante"];
type Produtor = components["schemas"]["Produtor"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

const TIPO: Record<Evento["tipo"], string> = {
  curso: "Curso",
  oficina: "Oficina",
  dia_de_campo: "Dia de campo",
  palestra: "Palestra",
  intercambio: "Intercâmbio",
};
const SITUACAO: Record<Evento["situacao"], string> = {
  planejado: "Planejado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};
const varianteSituacao = (s: Evento["situacao"]) =>
  s === "realizado" ? "default" : s === "cancelado" ? "destructive" : "secondary";

export default function EventoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { podeEditarCampo } = usePapel();

  const evento = useQuery({
    queryKey: ["eventos", id],
    queryFn: ({ signal }) => fetchData<Envelope<Evento>>(`/eventos/${id}`, { signal }),
  });
  const participantes = useQuery({
    queryKey: ["eventos", id, "participantes"],
    queryFn: ({ signal }) => fetchData<Envelope<Participante[]>>(`/eventos/${id}/participantes`, { signal }),
  });
  const e = evento.data?.data;

  if (evento.isError) {
    return (
      <PageLayout title="Evento">
        <EmptyState
          title={
            ehSemPermissao(evento.error) ? "Você não tem permissão para ver isto." : "Evento não encontrado"
          }
          description="Ele pode ter sido excluído, ou você não faz parte da equipe do projeto."
          action={
            <Button variant="outline" nativeButton={false} render={<Link href="/eventos" />}>
              <ArrowLeft className="size-4" /> Voltar para eventos
            </Button>
          }
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={e ? e.titulo : "Evento"}
      breadcrumb="Evento"
      titleExtra={e && <Badge variant={varianteSituacao(e.situacao)}>{SITUACAO[e.situacao]}</Badge>}
      actions={
        <Button variant="outline" nativeButton={false} render={<Link href="/eventos" />}>
          <ArrowLeft className="size-4" /> Eventos
        </Button>
      }
    >
      <section aria-labelledby="dados-titulo" className="border p-4">
        <h2 id="dados-titulo" className="sr-only">
          Dados do evento
        </h2>
        {evento.isPending ? (
          <div className="grid gap-2" aria-busy>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          e && (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>
                  {TIPO[e.tipo]}
                  {e.temaNome && <span className="text-muted-foreground"> · {e.temaNome}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Quando</dt>
                <dd className="tabular-nums">
                  {dataHora(e.inicio)} a {dataHora(e.fim)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Carga horária</dt>
                <dd className="tabular-nums">
                  {e.cargaHoraria != null
                    ? `${e.cargaHoraria.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Instrutor(a)</dt>
                <dd>{e.instrutor ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Local</dt>
                <dd>{[e.local, e.associacaoSigla, e.municipioNome].filter(Boolean).join(" · ")}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Participação</dt>
                <dd className="tabular-nums">
                  {numero(e.totalPresentes)} presentes de {numero(e.totalParticipantes)} inscritos
                </dd>
              </div>
              {e.relato && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <dt className="text-muted-foreground">Relato</dt>
                  <dd className="whitespace-pre-line">{e.relato}</dd>
                </div>
              )}
            </dl>
          )
        )}
      </section>

      <section aria-labelledby="presenca-titulo" className="space-y-3">
        <div>
          <h2 id="presenca-titulo" className="text-lg font-semibold">
            Lista de presença
          </h2>
          <p className="text-sm text-muted-foreground">
            Quem está marcado como presente conta como produtor capacitado nas metas do projeto.
          </p>
        </div>

        {participantes.isPending || !e ? (
          <div className="border p-4" aria-busy>
            <span role="status" className="sr-only">
              Carregando…
            </span>
            <Skeleton className="h-4 w-full" />
          </div>
        ) : participantes.isError ? (
          <p className="border p-4 text-center text-sm text-muted-foreground">
            {ehSemPermissao(participantes.error) ? (
              "Você não tem permissão para ver isto."
            ) : (
              <>
                Erro ao carregar a lista de presença.{" "}
                <Button variant="link" size="sm" onClick={() => participantes.refetch()}>
                  Tentar novamente
                </Button>
              </>
            )}
          </p>
        ) : (
          <ListaPresenca key={id} evento={e} servidor={participantes.data.data} editavel={podeEditarCampo} />
        )}
      </section>
    </PageLayout>
  );
}

/**
 * Editor local da lista (mesmo padrão de `LinhasPermissoes` em papeis/page.tsx):
 * as linhas vivem em estado até "Salvar lista", que substitui o conjunto inteiro
 * (PUT). Não é remontado quando a consulta recarrega — edição em curso não se perde.
 */
function ListaPresenca({
  evento,
  servidor,
  editavel,
}: {
  evento: Evento;
  servidor: Participante[];
  editavel: boolean;
}) {
  const queryClient = useQueryClient();
  const [linhas, setLinhas] = useState<Participante[]>(servidor);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [soDaAnfitria, setSoDaAnfitria] = useState(!!evento.associacaoId);
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const filtroAssociacao = soDaAnfitria ? (evento.associacaoId ?? undefined) : undefined;
  const produtores = useQuery({
    queryKey: ["produtores", { associacaoId: filtroAssociacao, ativo: true, limit: 200, sort: "nome:asc" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Produtor[], MetaPaginacao>>("/produtores", {
        query: { associacaoId: filtroAssociacao, ativo: true, limit: 200, sort: "nome:asc" },
        signal,
      }),
    enabled: editavel,
  });
  const naLista = useMemo(() => new Set(linhas.map((l) => l.produtorId)), [linhas]);
  const opcoesProdutor = useMemo(
    () =>
      (produtores.data?.data ?? [])
        .filter((p) => !naLista.has(p.id))
        .map((p) => ({ value: p.id, label: p.telefone ? `${p.nome} — ${telefone(p.telefone)}` : p.nome })),
    [produtores.data, naLista],
  );

  const alterado =
    linhas.length !== servidor.length ||
    linhas.some((l, i) => l.produtorId !== servidor[i]?.produtorId || l.presente !== servidor[i]?.presente);
  const presentes = linhas.filter((l) => l.presente).length;

  const salvar = useMutation({
    mutationFn: () =>
      fetchData<Envelope<Participante[]>>(`/eventos/${evento.id}/participantes`, {
        method: "PUT",
        body: { participantes: linhas.map((l) => ({ produtorId: l.produtorId, presente: l.presente })) },
      }),
    onSuccess: (resposta) => {
      toast.success("Lista de presença salva.");
      setLinhas(resposta.data);
      queryClient.setQueryData(["eventos", evento.id, "participantes"], resposta);
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
    },
    onError: (erro) => {
      const api = erro as ErroApi;
      if (api.status === 400 || api.status === 422) {
        setErrosApi(api.erros?.length ? api.erros : [api.message]);
      } else toast.error(mensagemDeErro(erro, "Não foi possível salvar a lista de presença."));
    },
  });

  const adicionar = () => {
    const produtor = produtores.data?.data.find((p) => p.id === escolhido);
    if (!produtor) return;
    setLinhas((atual) => [
      ...atual,
      {
        produtorId: produtor.id,
        nome: produtor.nome,
        telefone: produtor.telefone,
        associacaoId: null,
        associacaoSigla: null,
        // Lista montada depois do evento é de quem foi; antes, é de inscritos
        presente: evento.situacao === "realizado",
      },
    ]);
    setEscolhido(null);
  };
  const atualizar = (produtorId: string, presente: boolean) =>
    setLinhas((atual) => atual.map((l) => (l.produtorId === produtorId ? { ...l, presente } : l)));
  const colunas = editavel ? 5 : 4;

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        setErrosApi([]);
        salvar.mutate();
      }}
    >
      {errosApi.length > 0 && (
        <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
          {errosApi.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {editavel && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid w-full gap-1.5 sm:w-96">
            <Label htmlFor="presenca-produtor">Adicionar participante</Label>
            <Seletor
              id="presenca-produtor"
              className="h-9 w-full"
              opcoes={opcoesProdutor}
              valor={escolhido}
              onValorChange={setEscolhido}
              placeholder="Buscar produtor…"
              vazio="Nenhum produtor encontrado."
              disabled={produtores.isPending}
            />
          </div>
          <Button type="button" variant="outline" disabled={!escolhido} onClick={adicionar}>
            <Plus className="size-4" /> Adicionar
          </Button>
          {evento.associacaoId && (
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id="presenca-anfitria"
                checked={soDaAnfitria}
                onCheckedChange={(v) => {
                  setSoDaAnfitria(v);
                  setEscolhido(null);
                }}
              />
              <Label htmlFor="presenca-anfitria" className="font-normal">
                Só produtores de {evento.associacaoSigla}
              </Label>
            </div>
          )}
        </div>
      )}

      <div className="border">
        <Table aria-label="Participantes do evento">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Telefone</TableHead>
              <TableHead className="hidden md:table-cell">Associação</TableHead>
              <TableHead className="w-20 text-center">Presente</TableHead>
              {editavel && <TableHead className="w-16 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas} className="py-6 text-center text-muted-foreground">
                  Ninguém na lista ainda
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => (
                <TableRow key={l.produtorId}>
                  <TableCell className="font-medium whitespace-normal">{l.nome}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground tabular-nums sm:table-cell">
                    {telefone(l.telefone)}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{l.associacaoSigla ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {editavel ? (
                      <Checkbox
                        aria-label={`${l.nome} esteve presente`}
                        checked={l.presente}
                        onCheckedChange={(v) => atualizar(l.produtorId, v)}
                      />
                    ) : l.presente ? (
                      "Sim"
                    ) : (
                      <span className="text-muted-foreground">Não</span>
                    )}
                  </TableCell>
                  {editavel && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Remover da lista"
                        aria-label={`Remover ${l.nome} da lista`}
                        onClick={() =>
                          setLinhas((atual) => atual.filter((x) => x.produtorId !== l.produtorId))
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
          <p className="text-xs text-muted-foreground" role="status">
            {numero(presentes)} presentes de {numero(linhas.length)} na lista
            {alterado && <span className="font-medium text-foreground"> · alterações não salvas</span>}
          </p>
          {editavel && (
            <div className="flex flex-wrap items-center gap-2">
              {linhas.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLinhas((atual) => atual.map((l) => ({ ...l, presente: true })))}
                >
                  <CheckCheck className="size-4" /> Marcar todos
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Voltar à lista salva"
                onClick={() => {
                  setLinhas(servidor);
                  setErrosApi([]);
                }}
              >
                <Undo2 className="size-4" /> Desfazer
              </Button>
              <Button type="submit" size="sm" disabled={salvar.isPending}>
                {salvar.isPending ? (
                  <>
                    <Spinner /> Salvando…
                  </>
                ) : (
                  "Salvar lista"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
