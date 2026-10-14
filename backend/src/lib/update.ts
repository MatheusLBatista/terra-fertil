/**
 * Remove as chaves `undefined` de um payload de atualização.
 *
 * O Zod descarta campos desconhecidos, então um `PATCH` que só traga campos
 * não-editáveis chega ao service como `{}` — e `db.update().set({})` faz o
 * Drizzle estourar ("No values to set"), devolvendo 500 em vez de uma resposta
 * sensata. Espalhar `{ ...data, campo: undefined }` produz o mesmo efeito.
 *
 * Os repositories usam isto para decidir se há de fato algo a gravar.
 */
export function camposParaAtualizar<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;
}
