import type { Context } from "hono";
import type { z } from "zod";
import { errorResponse } from "./response.ts";

/** Issues do zod → mensagens `caminho: mensagem` para o `erros[]` do envelope. */
export const mapearIssues = (issues: z.core.$ZodIssue[]) =>
  issues.map((e) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message));

/** Issues do zod → `{ [campo]: mensagem }` (primeira mensagem de cada campo). */
export const camposDasIssues = (issues: z.core.$ZodIssue[]): Record<string, string> => {
  const campos: Record<string, string> = {};
  for (const issue of issues) {
    const campo = issue.path.length ? issue.path.join(".") : "_";
    campos[campo] ??= issue.message;
  }
  return campos;
};

/**
 * Resposta 400 de validação: `erros[]` continua sendo a lista de mensagens e
 * `meta.campos` traz o mapa campo → mensagem para o formulário marcar o input.
 * Aceita as issues de vários safeParse (params + body) concatenadas.
 */
export const respostaValidacao = (c: Context, issues: z.core.$ZodIssue[]) =>
  c.json(errorResponse(mapearIssues(issues), [], { campos: camposDasIssues(issues) }), 400);
