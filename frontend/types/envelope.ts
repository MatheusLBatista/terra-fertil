/**
 * Envelope padrão de TODA resposta da API: `{ data, meta, erros }` — sucesso e
 * erro usam o mesmo formato. `M` é o `meta` (nas listagens paginadas, use
 * `components["schemas"]["MetaPaginacao"]` de `types/api`).
 *
 * Escrito à mão, ao contrário do `api.d.ts` (gerado do OpenAPI).
 */
export type Envelope<T, M = Record<string, unknown>> = {
  data: T;
  meta: M;
  erros: string[];
};
