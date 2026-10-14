"use client";

import { useEffect, useState } from "react";

type Setter<T> = (valor: T) => unknown;

/**
 * Campo de busca com debounce. `busca` é o que está sendo digitado; 400ms
 * depois da última tecla o termo (com trim) vai para `setTermo` — normalmente
 * um `useQueryState` do nuqs, para a busca ficar na URL — e a página volta
 * para 1.
 *
 * Sem mudança real de termo (inclusive na montagem) não há debounce nem reset
 * de página: um link com `?page=3` continua na página 3. O `setState` acontece
 * dentro do timeout, não no corpo do efeito (regra `react-hooks/set-state-in-effect`).
 */
export function useBuscaDebounce(
  termo: string,
  setTermo: Setter<string | null>,
  setPage: Setter<number>,
  atrasoMs = 400,
) {
  const [busca, setBusca] = useState(termo);

  useEffect(() => {
    if (busca.trim() === termo) return;
    const t = setTimeout(() => {
      void setTermo(busca.trim() || null);
      void setPage(1);
    }, atrasoMs);
    return () => clearTimeout(t);
  }, [busca, termo, setTermo, setPage, atrasoMs]);

  return { busca, setBusca };
}
