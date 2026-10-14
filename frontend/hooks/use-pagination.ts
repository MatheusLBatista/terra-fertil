import { parseAsInteger, useQueryState } from "nuqs";

import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/lib/pageSizes";

interface UsePaginationOptions {
  /** Tamanho inicial da página; precisa estar em `PAGE_SIZES` (senão vale o padrão). */
  limit?: number;
}

/**
 * Paginação offset com `page` e `limit` na URL (nuqs): a tela fica linkável e
 * sobrevive ao voltar do navegador. `limit` fora da allowlist (URL editada à
 * mão) cai no padrão; trocar o tamanho volta para a página 1.
 */
export function usePagination({ limit: limitInicial }: UsePaginationOptions = {}) {
  const limitPadrao =
    limitInicial !== undefined && PAGE_SIZES.includes(limitInicial) ? limitInicial : DEFAULT_PAGE_SIZE;

  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [limitUrl, setLimitUrl] = useQueryState("limit", parseAsInteger.withDefault(limitPadrao));

  const limit = PAGE_SIZES.includes(limitUrl) ? limitUrl : limitPadrao;

  const setLimit = (novo: number) => {
    void setLimitUrl(novo);
    void setPage(1);
  };

  const offset = (page - 1) * limit;

  return { page, setPage, limit, setLimit, offset };
}
