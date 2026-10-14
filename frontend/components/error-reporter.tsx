"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * Captura o que escapa dos error boundaries: exceções fora do render
 * (`window.onerror`) e promises rejeitadas sem `catch` (`unhandledrejection`).
 * Erros do `fetchData` (`ErroApi`) já foram registrados por ele e são ignorados.
 */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (evento: ErrorEvent) => {
      logger.error(
        "Erro não tratado",
        {
          message: evento.message,
          source: evento.filename,
          line: evento.lineno,
          column: evento.colno,
          stack: evento.error?.stack,
        },
        "ErrorReporter",
      );
    };
    const onRejection = (evento: PromiseRejectionEvent) => {
      const motivo = evento.reason as { name?: string; message?: string; stack?: string } | undefined;
      if (motivo?.name === "ErroApi" || motivo?.name === "AbortError") return;
      logger.error(
        "Promise rejeitada sem tratamento",
        { name: motivo?.name, message: motivo?.message ?? String(evento.reason), stack: motivo?.stack },
        "ErrorReporter",
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
