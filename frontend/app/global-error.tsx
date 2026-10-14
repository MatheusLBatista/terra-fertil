"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./globals.css";
import { logger } from "@/lib/logger";

/**
 * Último recurso: exceção no próprio layout raiz (providers, fontes). Substitui
 * o `<html>` inteiro, por isso monta a página do zero e sem os componentes do
 * painel — só o que não pode falhar.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Erro no layout raiz", { message: error.message, digest: error.digest }, "GlobalError");
  }, [error]);

  return (
    <html lang="pt-BR" className="dark h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">Algo deu errado</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            A aplicação não conseguiu carregar. O problema foi registrado — tente novamente e, se persistir,
            avise o suporte.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Tentar novamente
            </button>
            <Link
              href="/"
              className="inline-flex h-9 items-center border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              Ir para o início
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
