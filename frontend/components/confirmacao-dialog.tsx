"use client";

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

  return (
    <AlertDialog open={confirmacao !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <AlertDialogContent>
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
            onClick={() => confirmacao?.onConfirmar()}
          >
            {pendente ? `${texto}…` : texto}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
