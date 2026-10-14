"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logger } from "@/lib/logger";

const semAssinatura = () => () => {};
const temHistoricoNoCliente = () => window.history.length > 1;
const temHistoricoNoServidor = () => false;

/**
 * Error boundary das telas autenticadas: a exceção de render fica dentro do
 * shell (menu e cabeçalho continuam) e o usuário pode tentar de novo, voltar
 * ou ir ao início — a raiz `/` despacha para o dashboard pelo proxy.
 */
export default function ErroAutenticado({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const temHistorico = useSyncExternalStore(semAssinatura, temHistoricoNoCliente, temHistoricoNoServidor);

  useEffect(() => {
    logger.error(
      "Erro de render não tratado",
      { message: error.message, digest: error.digest },
      "ErrorBoundary",
    );
  }, [error]);

  return (
    <PageLayout title="Algo deu errado">
      <EmptyState
        icon={TriangleAlert}
        title="Não foi possível exibir esta tela"
        description="O problema foi registrado. Tente novamente e, se persistir, avise o suporte."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Tentar novamente</Button>
            {temHistorico && (
              <Button variant="outline" onClick={() => router.back()}>
                Voltar
              </Button>
            )}
            <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
              Ir para o início
            </Button>
          </div>
        }
      />
    </PageLayout>
  );
}
