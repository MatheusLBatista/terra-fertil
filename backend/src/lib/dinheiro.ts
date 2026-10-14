/**
 * Dinheiro sempre em CENTAVOS (inteiro) — nunca float no banco nem na API.
 *
 *   paraCentavos(12.5)        → 1250
 *   paraCentavos("1.234,56")  → 123456   (entrada de formulário pt-BR)
 *   deCentavos(1250)          → 12.5     (só para exibição/cálculo pontual)
 *   formatarCentavos(1250)    → "R$ 12,50"
 */

/** Valor decimal (número ou texto em pt-BR/en) → centavos inteiros. Lança em entrada inválida. */
export function paraCentavos(valor: number | string): number {
  let numero: number;
  if (typeof valor === "number") {
    numero = valor;
  } else {
    const limpo = valor.trim().replace(/[R$\s]/g, "");
    // "1.234,56" (pt-BR) → "1234.56"; "1234.56" (en) fica como está
    const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
    numero = Number(normalizado);
  }
  if (!Number.isFinite(numero)) throw new TypeError(`Valor monetário inválido: ${String(valor)}`);
  // Number.EPSILON evita 1.005 * 100 = 100.49999 → 100
  return Math.round((numero + Number.EPSILON * Math.sign(numero)) * 100);
}

/** Centavos → valor decimal (para cálculo pontual ou exibição). */
export function deCentavos(centavos: number): number {
  return centavos / 100;
}

/** Centavos → texto formatado ("R$ 1.234,56"). */
export function formatarCentavos(centavos: number, moeda = "BRL", locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: moeda }).format(deCentavos(centavos));
}
