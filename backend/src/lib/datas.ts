/**
 * Datas de filtro (`?de=YYYY-MM-DD&ate=YYYY-MM-DD`, validadas com `z.iso.date()`).
 *
 * Os dias são de calendário em UTC (o servidor roda em TZ=UTC e as colunas são
 * timestamptz). O intervalo é meio-aberto: `gte(col, inicioDoDia(de))` e
 * `lt(col, diaSeguinte(ate))` — inclui o dia `ate` inteiro sem depender de hora.
 */

/** `"2026-03-10"` → `2026-03-10T00:00:00.000Z`. */
export function inicioDoDia(data: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** `"2026-03-10"` → `2026-03-11T00:00:00.000Z` (limite EXCLUSIVO do filtro `ate`). */
export function diaSeguinte(data: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1));
}
