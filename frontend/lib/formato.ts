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

/**
 * Data de calendário da API ("2026-03-10", colunas `date`) → "10/03/2026".
 * Não passa por `Date`: "2026-03-10" seria lido como meia-noite UTC e, num
 * fuso a oeste (Rondônia, UTC−4), apareceria como o dia anterior.
 */
export function dataCalendario(valor?: string | null) {
  if (!valor) return "—";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "—";
}

/** Telefone E.164 sem "+" ("5569993453103") → "(69) 99345-3103". */
export function telefone(valor?: string | null) {
  if (!valor) return "—";
  const d = valor.startsWith("55") ? valor.slice(2) : valor;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}
