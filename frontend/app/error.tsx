"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logger } from "@/lib/logger";

/**
 * Error boundary das telas públicas (login, recuperação de senha…). As telas
 * autenticadas têm o seu em `(auth)/error.tsx`, dentro do shell. A raiz `/`
 * despacha para login ou dashboard conforme a sessão.
 */
export default function ErroPublico({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(
      "Erro de render não tratado",
      { message: error.message, digest: error.digest },
      "ErrorBoundary",
    );
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-8">
      <EmptyState
        icon={TriangleAlert}
        title="Algo deu errado"
        description="O problema foi registrado. Tente novamente e, se persistir, avise o suporte."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Tentar novamente</Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
              Ir para o início
            </Button>
          </div>
        }
      />
    </main>
  );
}
