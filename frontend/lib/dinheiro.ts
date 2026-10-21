/**
 * Dinheiro nos formulários: o usuário digita reais ("1.234,56", "1234.56",
 * "R$ 10"); a API só fala em centavos (inteiro). Conversão de EXIBIÇÃO na
 * tabela é `moeda()` de `lib/formato.ts`.
 */

/** "1.234,56" → 123456; vazio → null; texto inválido → NaN (o zod recusa). */
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return Number.NaN;
  return Math.round((numero + Number.EPSILON * Math.sign(numero)) * 100);
}

/** 123456 → "1.234,56" (valor inicial do campo); null → "". */
export function textoDeCentavos(centavos?: number | null): string {
  if (typeof centavos !== "number") return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
