import { env } from "@/lib/env";

// Formatação compartilhada pelas telas. Tudo em pt-BR; datas no fuso de
// `NEXT_PUBLIC_TIMEZONE` (em branco, o do navegador).

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: env.TIMEZONE,
});

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: env.TIMEZONE,
});

const NUMERO = new Intl.NumberFormat("pt-BR");

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function dataHora(valor?: string | null) {
  if (!valor) return "—";
  return DATA_HORA.format(new Date(valor));
}

export function data(valor?: string | null) {
  if (!valor) return "—";
  return DATA.format(new Date(valor));
}

/** 5570 → "5.570" (separador de milhar). */
export function numero(valor?: number | null) {
  if (typeof valor !== "number" || Number.isNaN(valor)) return "—";
  return NUMERO.format(valor);
}

/** Centavos (inteiro) → "R$ 1.234,56". A API só fala em centavos. */
export function moeda(centavos?: number | null) {
  if (typeof centavos !== "number" || Number.isNaN(centavos)) return "—";
  return MOEDA.format(centavos / 100);
}
