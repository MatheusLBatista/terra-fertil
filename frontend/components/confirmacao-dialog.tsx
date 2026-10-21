"use client";

import { useRef } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type Confirmacao = {
  titulo: string;
  descricao: React.ReactNode;
  /** Rótulo do botão de confirmar (padrão "Confirmar"). */
  textoConfirmar?: string;
  /** Ação destrutiva: botão em vermelho. */
  destrutivo?: boolean;
  /** Mutation em andamento: botões desabilitados e rótulo com "…". */
  pendente?: boolean;
  onConfirmar: () => void;
  /** Conteúdo extra entre a descrição e os botões (ex.: campo de motivo). */
  children?: React.ReactNode;
  /**
   * Para onde vai o foco quando a ação CONCLUI e o diálogo fecha. Use quando a
   * ação some com o botão que abriu o diálogo (excluir/remover a linha, banir
   * troca o botão por "Desbanir") — sem isso o foco cai no `<body>`. Cancelar
   * (botão ou Esc) devolve o foco ao botão de origem, como sempre.
   */
  focoAposConfirmar?: React.RefObject<HTMLElement | null>;
};

interface ConfirmacaoDialogProps {
  /** `null` fecha o diálogo. Monte o objeto no render (não em state) para `pendente` acompanhar a mutation. */
  confirmacao: Confirmacao | null;
  onFechar: () => void;
}

/**
 * Diálogo de confirmação dirigido por um `Confirmacao | null`: a tela guarda
 * só "o que está sendo confirmado" (ex.: o registro a excluir) e deriva o
 * objeto no render — assim `pendente` reflete a mutation em tempo real.
 */
export function ConfirmacaoDialog({ confirmacao, onFechar }: ConfirmacaoDialogProps) {
  const texto = confirmacao?.textoConfirmar ?? "Confirmar";
  const pendente = confirmacao?.pendente ?? false;
  const aberto = confirmacao !== null;
  // Gravado no clique de confirmar: quando a tela fecha o diálogo no onSuccess,
  // `confirmacao` já é null — o destino do foco precisa sobreviver a isso.
  const focoFinal = useRef<React.RefObject<HTMLElement | null> | null>(null);

  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (abrir) return;
        focoFinal.current = null;
        onFechar();
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          if (aberto) return true;
          const alvo = focoFinal.current?.current ?? null;
          focoFinal.current = null;
          if (!alvo) return true;
          // Focamos nós mesmos: com um alvo não tabulável (tabela com tabIndex -1)
          // o base-ui pularia para o primeiro botão dentro dele.
          queueMicrotask(() => alvo.focus({ preventScroll: true }));
          return false;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmacao?.titulo}</AlertDialogTitle>
          <AlertDialogDescription>{confirmacao?.descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmacao?.children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmacao?.destrutivo ? "destructive" : "default"}
            disabled={pendente}
            onClick={() => {
              focoFinal.current = confirmacao?.focoAposConfirmar ?? null;
              confirmacao?.onConfirmar();
            }}
          >
            {pendente ? `${texto}…` : texto}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
