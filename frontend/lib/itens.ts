import type { components } from "@/types/api";

export type CategoriaItem = components["schemas"]["Item"]["categoria"];

/** Categoria do item do catálogo — classifica a demanda da associação (reunião de 23/10). */
export const CATEGORIAS_ITEM: { valor: CategoriaItem; rotulo: string }[] = [
  { valor: "insumo", rotulo: "Insumo" },
  { valor: "maquina", rotulo: "Máquina" },
  { valor: "implemento", rotulo: "Implemento" },
  { valor: "equipamento", rotulo: "Equipamento" },
];

export const rotuloCategoriaItem = (c: CategoriaItem) =>
  CATEGORIAS_ITEM.find((x) => x.valor === c)?.rotulo ?? c;
