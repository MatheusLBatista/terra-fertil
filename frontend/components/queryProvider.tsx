"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { logger } from "@/lib/logger";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Único lugar com staleTime: as telas não sobrescrevem (regra do
            // data-table-pattern). 30s evita refetch ao voltar de um sheet.
            staleTime: 30_000,
            // Erro 4xx é definitivo (validação, permissão, não encontrado):
            // repetir só atrasa a tela de erro. 5xx/rede tentam mais 2 vezes.
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            onError: (error) => {
              // O fetchData já registra as respostas da API (warn 4xx, error 5xx);
              // aqui só entra o que não passou por ele (exceção de código,
              // erro 5xx do authClient).
              const status = (error as { status?: number })?.status;
              if (error?.name === "ErroApi") return;
              if (typeof status === "number" && status >= 400 && status < 500) return;
              logger.error(
                "Erro em mutation do React Query",
                { message: (error as { message?: string })?.message, name: error?.name, status },
                "QueryProvider",
              );
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
