import { z } from "zod";

/**
 * Variáveis `NEXT_PUBLIC_*` validadas no carregamento do módulo (fail fast:
 * em dev e no build). Cada uma precisa ser lida com o nome literal
 * `process.env.NEXT_PUBLIC_X` para o Next embutir o valor no bundle.
 *
 * `NEXT_PUBLIC_API_URL_CLIENT` está depreciada: ainda serve de fallback para
 * `NEXT_PUBLIC_API_URL` enquanto os `.env` antigos existirem.
 */
const booleano = z
  .string()
  .optional()
  .transform((v) => v === "true");

const opcional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const esquema = z.object({
  NEXT_PUBLIC_API_URL: z.url({ error: "informe a URL base da API (ex.: http://localhost:3080)" }),
  NEXT_PUBLIC_APP_URL: z.url({ error: "informe a URL pública deste app (ex.: http://localhost:3000)" }),
  NEXT_PUBLIC_GOOGLE_LOGIN: booleano,
  NEXT_PUBLIC_SIGNUP_ENABLED: booleano,
  NEXT_PUBLIC_APP_NOME: opcional,
  NEXT_PUBLIC_AMBIENTE: opcional.pipe(
    z
      .enum(["development", "staging", "preview"], { error: "use development, staging ou preview" })
      .optional(),
  ),
  NEXT_PUBLIC_PAGE_SIZES: opcional,
  NEXT_PUBLIC_TIMEZONE: opcional.refine(
    (tz) => {
      if (!tz) return true;
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { error: "fuso inválido (ex.: America/Porto_Velho)" },
  ),
  NEXT_PUBLIC_TEMA_PADRAO: opcional.pipe(
    z.enum(["dark", "light", "system"], { error: "use dark, light ou system" }).default("dark"),
  ),
});

const resultado = esquema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL_CLIENT,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_GOOGLE_LOGIN: process.env.NEXT_PUBLIC_GOOGLE_LOGIN,
  NEXT_PUBLIC_SIGNUP_ENABLED: process.env.NEXT_PUBLIC_SIGNUP_ENABLED,
  NEXT_PUBLIC_APP_NOME: process.env.NEXT_PUBLIC_APP_NOME,
  NEXT_PUBLIC_AMBIENTE: process.env.NEXT_PUBLIC_AMBIENTE,
  NEXT_PUBLIC_PAGE_SIZES: process.env.NEXT_PUBLIC_PAGE_SIZES,
  NEXT_PUBLIC_TIMEZONE: process.env.NEXT_PUBLIC_TIMEZONE,
  NEXT_PUBLIC_TEMA_PADRAO: process.env.NEXT_PUBLIC_TEMA_PADRAO,
});

if (!resultado.success) {
  const linhas = resultado.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(
    `Variáveis de ambiente do frontend inválidas (confira o .env.local / build args do Dockerfile):\n${linhas.join("\n")}`,
  );
}

const v = resultado.data;

export const env = {
  /** URL base da API (sem barra final). */
  API_URL: v.NEXT_PUBLIC_API_URL.replace(/\/+$/, ""),
  /** URL pública deste app (callbacks OAuth, links de e-mail). */
  APP_URL: v.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""),
  GOOGLE_LOGIN: v.NEXT_PUBLIC_GOOGLE_LOGIN,
  SIGNUP_ENABLED: v.NEXT_PUBLIC_SIGNUP_ENABLED,
  APP_NOME: v.NEXT_PUBLIC_APP_NOME,
  AMBIENTE: v.NEXT_PUBLIC_AMBIENTE,
  PAGE_SIZES: v.NEXT_PUBLIC_PAGE_SIZES,
  /** Fuso das datas exibidas; `undefined` = fuso do navegador. */
  TIMEZONE: v.NEXT_PUBLIC_TIMEZONE,
  TEMA_PADRAO: v.NEXT_PUBLIC_TEMA_PADRAO,
} as const;
