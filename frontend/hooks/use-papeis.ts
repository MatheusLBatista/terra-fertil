"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/fetchData";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";
import { DESCRICAO_PAPEL, PAPEIS, type Papel } from "@/lib/papeis";

export type PermissaoItem = components["schemas"]["PermissaoItem"];
export type PapelApi = components["schemas"]["PapelListaItem"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

export const SORT_PAPEIS_PADRAO = "nome:asc";

/**
 * Teto do `limit` na API (`paginacaoQuery`: max 200). Papéis são uma lista curta
 * por natureza, então a tela /papeis e os selects pedem tudo de uma vez — sem
 * paginação. `total` (do `meta`) diz se a lista veio cortada: a tela avisa.
 */
export const LIMITE_PAPEIS = 200;

/**
 * Papéis DINÂMICOS — a tabela `papeis` do backend (GET /papeis, rota de admin),
 * já com as permissões de cada um (`incluir=permissoes`, uma request só).
 * É a MESMA consulta (mesma `queryKey`) da tela /papeis e dos selects de
 * papel: um único registro no cache — por isso mora aqui e não no page.tsx.
 * Enquanto a lista não chega (ou se falhar), cai nos papéis do seed, então os
 * selects nunca ficam vazios.
 */
export function usePapeisDinamicos(sort = SORT_PAPEIS_PADRAO, opcoes: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["papeis", { sort, incluir: "permissoes", limit: LIMITE_PAPEIS }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<PapelApi[], MetaPaginacao>>("/papeis", {
        query: { limit: LIMITE_PAPEIS, sort, incluir: "permissoes" },
        signal,
      }),
    enabled: opcoes.enabled,
  });

  // Estáveis entre renders (as colunas de /usuarios dependem deles num useMemo).
  const lista = query.data?.data;
  const { itens, nomes, descricaoDe } = useMemo(() => {
    const itens = lista ?? [];
    return {
      itens,
      nomes: itens.length > 0 ? itens.map((p) => p.nome) : [...PAPEIS],
      descricaoDe: (nome: string) =>
        itens.find((p) => p.nome === nome)?.descricao ?? DESCRICAO_PAPEL[nome as Papel] ?? "",
    };
  }, [lista]);
  const total = query.data?.meta.total;

  return { ...query, itens, total, nomes, descricaoDe };
}
