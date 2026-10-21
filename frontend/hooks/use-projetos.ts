"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/fetchData";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

export type Projeto = components["schemas"]["Projeto"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

/** Teto do `limit` na API — projetos são poucos; filtros e formulários pedem todos. */
const LIMITE_PROJETOS = 200;

/**
 * Projetos que o usuário enxerga (a API já aplica o escopo da equipe) — a
 * MESMA consulta para os filtros "Projeto" e os selects dos formulários de
 * todas as telas do domínio: um registro no cache. `opcoes` vem pronta para o
 * `Seletor`/`NativeSelect`; `unico` é o id quando há um só projeto (a tela
 * pode pré-selecioná-lo).
 */
export function useProjetos() {
  const query = useQuery({
    queryKey: ["projetos", { sort: "inicio:desc", limit: LIMITE_PROJETOS }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Projeto[], MetaPaginacao>>("/projetos", {
        query: { limit: LIMITE_PROJETOS, sort: "inicio:desc" },
        signal,
      }),
  });
  const itens = query.data?.data ?? [];
  const opcoes = itens.map((p) => ({ value: p.id, label: `${p.sigla} — ${p.nome}` }));
  const unico = itens.length === 1 ? itens[0].id : undefined;
  return { ...query, itens, opcoes, unico };
}
