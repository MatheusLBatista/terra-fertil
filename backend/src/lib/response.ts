/**
 * Envelope padrão de TODAS as respostas da API: `{ data, meta, erros }`.
 * Sucesso e erro usam o mesmo formato — o cliente sempre pode ler `erros[0]`.
 */
export function successResponse(data: unknown = [], meta: Record<string, unknown> = {}) {
  return { data, meta, erros: [] };
}

/** `meta` em erro: `campos` (validação, por campo) e `codigo` (AppError.codigo). */
export function errorResponse(
  errors: string[] | string,
  data: unknown = [],
  meta: Record<string, unknown> = {},
) {
  return { data, meta, erros: Array.isArray(errors) ? errors : [errors] };
}
