import { env } from "@/lib/env";

/**
 * Tamanhos de página oferecidos nas listagens ("Itens por página").
 *
 * Vem de `NEXT_PUBLIC_PAGE_SIZES` ("10,25,50,100"); em branco ou inválida,
 * cai no padrão. O primeiro valor da lista é o tamanho inicial das telas.
 */
const PADRAO = [10, 25, 50, 100] as const;

function lerPageSizes(): readonly number[] {
  const bruto = env.PAGE_SIZES;
  if (!bruto) return PADRAO;

  const lista = bruto
    .split(",")
    .map((parte) => Number.parseInt(parte.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  // Mantém a ordem informada (o primeiro é o padrão) e remove repetidos.
  const unicos = Array.from(new Set(lista));
  return unicos.length > 0 ? unicos : PADRAO;
}

export const PAGE_SIZES: readonly number[] = lerPageSizes();
export const DEFAULT_PAGE_SIZE: number = PAGE_SIZES[0];
