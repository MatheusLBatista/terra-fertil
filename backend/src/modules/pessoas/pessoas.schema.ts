import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { ERROS, SEGURANCA, criado, filtroTexto, okLista } from "../../lib/openapi/helpers.ts";
import { normalizarTelefone } from "../../lib/documentos.ts";

extendZodWithOpenApi(z);

export const PessoaSchema = registry.register(
  "Pessoa",
  z
    .object({
      id: z.string().openapi({ description: "Id do usuário (better-auth)" }),
      nome: z.string(),
      email: z.string().nullable().openapi({ description: "Nulo quando a pessoa não tem e-mail" }),
      telefone: z.string().nullable().openapi({ description: "E.164 sem + (ex.: 5569993453103)" }),
      papel: z.string().nullable(),
    })
    .openapi({ description: "Pessoa do domínio — um usuário, com ou sem acesso ao painel" }),
);

/** Telefone em qualquer formato → E.164 sem "+"; inválido vira erro de validação. */
export const telefoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const t = normalizarTelefone(v);
    if (!t) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido (informe DDD + número)" });
      return z.NEVER;
    }
    return t;
  })
  .openapi({ example: "(69) 99345-3103" });

export const NovaPessoaSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome").max(200),
    email: z.email("E-mail inválido").optional(),
    telefone: telefoneSchema.optional(),
  })
  .openapi({ description: "Pessoa nova — sem e-mail, recebe um e-mail técnico e não acessa o painel" });

/**
 * Referência a uma pessoa em formulários de produtor/contato/equipe:
 * `userId` de quem já existe OU `pessoa` para cadastrar na hora — um dos dois.
 */
export const PessoaRefSchema = {
  userId: z.string().min(1).optional(),
  pessoa: NovaPessoaSchema.optional(),
};
export const refinarPessoa = <T extends { userId?: string; pessoa?: unknown }>(v: T) =>
  (v.userId === undefined) !== (v.pessoa === undefined);
export const MENSAGEM_PESSOA = "Informe userId (pessoa existente) ou pessoa (nova) — um dos dois";

export const ListPessoasQuerySchema = z.object({
  busca: filtroTexto("Nome, e-mail ou telefone (contém)"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Pessoas"];

registry.registerPath({
  method: "get",
  path: "/pessoas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Buscar pessoas (para selecionar produtor, contato ou membro da equipe)",
  request: { query: ListPessoasQuerySchema },
  responses: { 200: okLista(PessoaSchema), ...ERROS.validacao, ...ERROS.autenticado },
});

registry.registerPath({
  method: "post",
  path: "/pessoas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Cadastrar pessoa sem acesso ao painel (e-mail e telefone opcionais e únicos)",
  request: { body: { content: { "application/json": { schema: NovaPessoaSchema } } } },
  responses: { 201: criado(PessoaSchema), ...ERROS.validacao, ...ERROS.autenticado, ...ERROS.conflito },
});
