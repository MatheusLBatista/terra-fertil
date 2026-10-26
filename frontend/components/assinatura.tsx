"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Eraser, PenLine, Trash2 } from "lucide-react";

import { SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { env } from "@/lib/env";
import { fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import { dataHora } from "@/lib/formato";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

/*
 * Assinatura eletrônica simples (traço desenhado na tela) — a mesma para a
 * visita, o termo de uso da entrega e o documento da associação. A API de cada
 * alvo fica sob `base` (ex.: "/visitas/<id>"): GET/POST/DELETE `base/assinatura`
 * e GET `base/assinatura/imagem`. A biblioteca de desenho (signature_pad) só
 * aparece em `AreaAssinatura`: trocar de biblioteca é mexer só ali.
 */

export type Assinatura = components["schemas"]["Assinatura"];
export type PapelAssinante = Assinatura["papel"];

export const PAPEIS_ASSINANTE: { valor: PapelAssinante; rotulo: string }[] = [
  { valor: "presidente", rotulo: "Presidente" },
  { valor: "vice_presidente", rotulo: "Vice-presidente" },
  { valor: "proprietario", rotulo: "Proprietário" },
  { valor: "outro", rotulo: "Outro representante" },
];
export const rotuloPapel = (p: PapelAssinante) => PAPEIS_ASSINANTE.find((x) => x.valor === p)?.rotulo ?? p;

/** Consulta da assinatura do alvo (`data` null = ainda não assinado). Mesma key em todo lugar. */
export function useAssinatura(base: string, queryKey: QueryKey, enabled = true) {
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchData<Envelope<Assinatura | null>>(`${base}/assinatura`, { signal }),
    enabled,
  });
}

// ─── Área de desenho ─────────────────────────────────────────────────────────

/**
 * Canvas de assinatura com fundo branco (a imagem fica legível nos dois temas).
 * Redimensiona com a tela mantendo o traço; `onPronta` entrega como exportar o PNG.
 */
function AreaAssinatura({
  id,
  invalida,
  descricaoId,
  onMudou,
  onPronta,
}: {
  id: string;
  invalida: boolean;
  descricaoId: string;
  onMudou: (vazia: boolean) => void;
  onPronta: (api: { paraPng: () => Promise<Blob | null>; limpar: () => void }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)", penColor: "rgb(17,24,39)" });
    const avisar = () => onMudou(pad.isEmpty());
    pad.addEventListener("endStroke", avisar);

    // Canvas na densidade da tela; o traço é redesenhado ao mudar de tamanho
    const ajustar = () => {
      const dados = pad.toData();
      const razao = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * razao;
      canvas.height = canvas.offsetHeight * razao;
      canvas.getContext("2d")?.scale(razao, razao);
      pad.clear();
      pad.fromData(dados);
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(canvas);

    onPronta({
      paraPng: () =>
        pad.isEmpty() ? Promise.resolve(null) : new Promise((ok) => canvas.toBlob((b) => ok(b), "image/png")),
      limpar: () => {
        pad.clear();
        avisar();
      },
    });
    return () => {
      observador.disconnect();
      pad.removeEventListener("endStroke", avisar);
      pad.off();
    };
    // Monta uma vez: os callbacks são estáveis o bastante para o ciclo do formulário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id={id}
      role="img"
      aria-label="Área de assinatura — desenhe com o dedo, a caneta ou o mouse"
      aria-describedby={descricaoId}
      className={`h-48 w-full touch-none border bg-white ${invalida ? "border-destructive" : "border-input"}`}
    />
  );
}

// ─── Formulário de coleta ────────────────────────────────────────────────────

/**
 * Nome + papel + traço. Pensado para o Sheet: rolagem no corpo e rodapé fixo.
 * `papeis` limita os papéis aceitos pelo alvo (a API recusa os demais).
 */
export function FormularioAssinatura({
  base,
  queryKey,
  invalidar = [],
  papeis,
  nomeSugerido,
  aviso,
  onFechar,
}: {
  base: string;
  queryKey: QueryKey;
  /** Outras consultas que mudam com a assinatura (ex.: a lista com `temAssinatura`). */
  invalidar?: QueryKey[];
  papeis: PapelAssinante[];
  nomeSugerido?: string | null;
  /** Texto explicando o que a assinatura confirma. */
  aviso: string;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(nomeSugerido ?? "");
  const [papel, setPapel] = useState<PapelAssinante>(papeis[0]);
  const [vazia, setVazia] = useState(true);
  const [tentou, setTentou] = useState(false);
  const [errosApi, setErrosApi] = useState<string[]>([]);
  const area = useRef<{ paraPng: () => Promise<Blob | null>; limpar: () => void } | null>(null);

  const erroNome = !nome.trim()
    ? "Informe o nome de quem assina"
    : nome.length > 200
      ? "No máximo 200 caracteres"
      : null;
  const erroTraco = vazia ? "Desenhe a assinatura na área acima" : null;

  const salvar = useMutation({
    mutationFn: async () => {
      const png = await area.current?.paraPng();
      if (!png) throw new Error("Desenhe a assinatura na área acima");
      const formData = new FormData();
      formData.append("imagem", new File([png], "assinatura.png", { type: "image/png" }));
      formData.append("nome", nome.trim());
      formData.append("papel", papel);
      return fetchData(`${base}/assinatura`, { method: "POST", formData });
    },
    onSuccess: () => {
      toast.success("Assinatura registrada.");
      queryClient.invalidateQueries({ queryKey });
      for (const k of invalidar) queryClient.invalidateQueries({ queryKey: k });
      onFechar();
    },
    onError: (erro) => {
      const e = erro as Partial<ErroApi>;
      setErrosApi(
        e.erros?.length ? e.erros : [mensagemDeErro(erro, "Não foi possível registrar a assinatura.")],
      );
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
        if (!erroNome && !erroTraco) salvar.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {errosApi.length > 0 && (
          <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
            {errosApi.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{aviso}</p>

        <div className="grid gap-1.5">
          <Label htmlFor="assinatura-nome">Nome de quem assina</Label>
          <Input
            id="assinatura-nome"
            maxLength={200}
            autoComplete="off"
            value={nome}
            aria-invalid={tentou && !!erroNome}
            aria-describedby={tentou && erroNome ? "assinatura-nome-erro" : undefined}
            onChange={(e) => setNome(e.target.value)}
          />
          {tentou && erroNome && (
            <p id="assinatura-nome-erro" role="alert" className="text-xs text-destructive">
              {erroNome}
            </p>
          )}
        </div>

        {papeis.length > 1 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="assinatura-papel">Assina como</Label>
            <NativeSelect
              id="assinatura-papel"
              className="w-full"
              value={papel}
              onChange={(e) => setPapel(e.target.value as PapelAssinante)}
            >
              {papeis.map((p) => (
                <NativeSelectOption key={p} value={p}>
                  {rotuloPapel(p)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <p className="text-sm">
            Assina como <span className="font-medium">{rotuloPapel(papeis[0])}</span>
          </p>
        )}

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            {/* Canvas não é campo rotulável: o nome acessível vem do aria-label dele */}
            <span className="text-xs">Assinatura</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => area.current?.limpar()}>
              <Eraser className="size-4" /> Limpar
            </Button>
          </div>
          <AreaAssinatura
            id="assinatura-area"
            invalida={tentou && !!erroTraco}
            descricaoId={tentou && erroTraco ? "assinatura-area-erro" : "assinatura-area-dica"}
            onMudou={setVazia}
            onPronta={(api) => {
              area.current = api;
            }}
          />
          {tentou && erroTraco ? (
            <p id="assinatura-area-erro" role="alert" className="text-xs text-destructive">
              {erroTraco}
            </p>
          ) : (
            <p id="assinatura-area-dica" className="text-xs text-muted-foreground">
              Peça à pessoa que assine com o dedo ou a caneta. Assinatura eletrônica simples, sem certificado
              digital.
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
            "Registrar assinatura"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

// ─── Assinatura registrada ───────────────────────────────────────────────────

/**
 * A imagem sai da API com o cookie (o CSP do painel não libera <img> da API
 * em dev) e é exibida como `blob:` — como as miniaturas das visitas.
 */
function ImagemAssinatura({ base, assinatura }: { base: string; assinatura: Assinatura }) {
  const imagem = useQuery({
    queryKey: ["assinaturas", assinatura.id, "imagem"],
    queryFn: async ({ signal }) => {
      const resposta = await fetch(`${env.API_URL}${base}/assinatura/imagem`, {
        credentials: "include",
        signal,
      });
      if (!resposta.ok) throw Object.assign(new Error("Imagem indisponível"), { status: resposta.status });
      return URL.createObjectURL(await resposta.blob());
    },
  });
  if (!imagem.data) {
    return imagem.isPending ? (
      <Skeleton className="h-28 w-full max-w-sm" />
    ) : (
      <div className="flex h-28 w-full max-w-sm items-center justify-center border bg-muted/40 text-xs text-muted-foreground">
        Imagem indisponível
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob: local, o otimizador do Next não se aplica
    <img
      src={imagem.data}
      alt={`Assinatura de ${assinatura.nome}`}
      className="h-28 w-full max-w-sm border bg-white object-contain"
    />
  );
}

/** Assinatura registrada (imagem, quem, como, quando) + remover, para corrigir e colher de novo. */
export function CartaoAssinatura({
  base,
  queryKey,
  invalidar = [],
  assinatura,
  editavel,
  avisoRemover,
}: {
  base: string;
  queryKey: QueryKey;
  invalidar?: QueryKey[];
  assinatura: Assinatura;
  editavel: boolean;
  avisoRemover: string;
}) {
  const queryClient = useQueryClient();
  const [remover, setRemover] = useState(false);

  const removerMutation = useMutation({
    mutationFn: () => fetchData(`${base}/assinatura`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Assinatura removida.");
      setRemover(false);
      queryClient.invalidateQueries({ queryKey });
      for (const k of invalidar) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Não foi possível remover a assinatura.")),
  });

  const confirmacao: Confirmacao | null = remover
    ? {
        titulo: "Remover a assinatura?",
        descricao: avisoRemover,
        textoConfirmar: "Remover",
        destrutivo: true,
        pendente: removerMutation.isPending,
        onConfirmar: () => removerMutation.mutate(),
      }
    : null;

  return (
    <div className="grid gap-3 border p-4 sm:grid-cols-[minmax(0,24rem)_1fr] sm:items-start">
      <ImagemAssinatura base={base} assinatura={assinatura} />
      <div className="flex flex-col gap-2 text-sm">
        <dl className="grid gap-2">
          <div>
            <dt className="text-xs text-muted-foreground">Assinado por</dt>
            <dd className="font-medium wrap-anywhere">
              {assinatura.nome} — {rotuloPapel(assinatura.papel)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Em</dt>
            <dd className="tabular-nums">{dataHora(assinatura.assinadoEm)}</dd>
          </div>
          {assinatura.registradoPorNome && (
            <div>
              <dt className="text-xs text-muted-foreground">Colhida por</dt>
              <dd>{assinatura.registradoPorNome}</dd>
            </div>
          )}
        </dl>
        {editavel && (
          <div>
            <Button variant="outline" size="sm" onClick={() => setRemover(true)}>
              <Trash2 className="size-4 text-destructive" /> Remover assinatura
            </Button>
          </div>
        )}
      </div>
      <ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => setRemover(false)} />
    </div>
  );
}

/**
 * Conteúdo do Sheet de assinatura de um documento (termo de uso, documento da
 * associação): carregando → assinatura registrada (com remover) ou a coleta.
 */
export function PainelAssinatura({
  base,
  queryKey,
  invalidar = [],
  editavel,
  papeis,
  aviso,
  avisoRemover,
  avisoTravado,
  onFechar,
}: {
  base: string;
  queryKey: QueryKey;
  invalidar?: QueryKey[];
  editavel: boolean;
  papeis: PapelAssinante[];
  aviso: string;
  avisoRemover: string;
  /** O que fica travado enquanto assinado. */
  avisoTravado: string;
  onFechar: () => void;
}) {
  const assinatura = useAssinatura(base, queryKey);
  const dado = assinatura.data?.data;

  if (assinatura.isPending) {
    return (
      <div className="p-4" aria-busy>
        <span role="status" className="sr-only">
          Carregando…
        </span>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (assinatura.isError) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {mensagemDeErro(assinatura.error, "Não foi possível carregar a assinatura.")}
      </p>
    );
  }
  if (dado) {
    return (
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        <CartaoAssinatura
          base={base}
          queryKey={queryKey}
          invalidar={invalidar}
          assinatura={dado}
          editavel={editavel}
          avisoRemover={avisoRemover}
        />
        <p className="text-xs text-muted-foreground">{avisoTravado}</p>
      </div>
    );
  }
  if (!editavel) return <p className="p-4 text-sm text-muted-foreground">Ainda não assinado.</p>;
  return (
    <FormularioAssinatura
      base={base}
      queryKey={queryKey}
      invalidar={invalidar}
      papeis={papeis}
      aviso={aviso}
      onFechar={onFechar}
    />
  );
}

/** Ícone do botão de colher assinatura (mesmo em todas as telas). */
export { PenLine as IconeAssinar };
