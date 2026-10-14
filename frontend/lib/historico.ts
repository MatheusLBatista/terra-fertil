import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { components } from "@/types/api";

export type HistoricoAlteracao = components["schemas"]["HistoricoAlteracao"];
export type Operacao = HistoricoAlteracao["operacao"];

export const OPERACOES: Operacao[] = ["INSERT", "UPDATE", "DELETE"];

/** Rótulo em PT-BR da operação gravada pela trigger `trg_historico`. */
export const ROTULO_OPERACAO: Record<Operacao, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

type VarianteBadge = VariantProps<typeof badgeVariants>["variant"];

const VARIANTE_OPERACAO: Record<Operacao, VarianteBadge> = {
  INSERT: "secondary",
  UPDATE: "outline",
  DELETE: "destructive",
};

export const varianteOperacao = (op?: string | null): VarianteBadge =>
  VARIANTE_OPERACAO[op as Operacao] ?? "outline";

/** `historico_alteracoes` → "Histórico alteracoes" para cabeçalho de tabela. */
export function nomeTabela(tabela: string) {
  const texto = tabela.replaceAll("_", " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
