"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchData } from "@/lib/fetchData";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";
import { DESCRICAO_PAPEL, PAPEIS, type Papel } from "@/lib/papeis";

export type PermissaoItem = components["schemas"]["PermissaoItem"];
export type PapelApi = components["schemas"]["PapelListaItem"];

export const SORT_PAPEIS_PADRAO = "nome:asc";

/**
 * Papéis DINÂMICOS — a tabela `papeis` do backend (GET /papeis, rota de admin),
 * já com as permissões de cada um (`incluir=permissoes`, uma request só).
 * É a MESMA consulta (mesma `queryKey`) da tela /papeis e dos selects de
 * papel: um único registro no cache. Enquanto a lista não chega (ou se
 * falhar), cai nos papéis do seed, então os selects nunca ficam vazios.
 */
export function usePapeisDinamicos(sort = SORT_PAPEIS_PADRAO, opcoes: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["papeis", { sort, incluir: "permissoes" }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<PapelApi[]>>("/papeis", {
        query: { limit: 100, sort, incluir: "permissoes" },
        signal,
      }),
    enabled: opcoes.enabled,
  });

  const itens = query.data?.data ?? [];
  const nomes = itens.length > 0 ? itens.map((p) => p.nome) : [...PAPEIS];
  const descricaoDe = (nome: string) =>
    itens.find((p) => p.nome === nome)?.descricao ?? DESCRICAO_PAPEL[nome as Papel] ?? "";

  return { ...query, itens, nomes, descricaoDe };
}
