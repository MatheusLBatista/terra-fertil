import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import {
  ERROS,
  ERROS_LEITURA,
  ERROS_ESCRITA,
  SEGURANCA,
  ok,
  okPagina,
  criado,
  semConteudo,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_PAPEIS = ["nome", "createdAt"] as const;

export const AcaoPermissaoSchema = z.enum(["manage", "create", "read", "update", "delete"]);

export const PermissaoItemSchema = registry.register(
  "PermissaoItem",
  z
    .object({
      acao: AcaoPermissaoSchema.openapi({ description: '"manage" = todas as ações' }),
      subject: z
        .string()
        .min(1)
        .openapi({ description: 'Subject CASL do módulo (ex.: "HistoricoAlteracao") ou "all"' }),
    })
    .openapi({ description: "Par (ação, subject) concedido a um papel" }),
);

export const PapelSchema = registry.register(
  "Papel",
  z
    .object({
      id: z.uuid(),
      nome: z.string().openapi({ description: "Chave natural — referenciada por user.role (FK)" }),
      descricao: z.string().nullable(),
    })
    .openapi({ description: "Papel (role) do RBAC" }),
);

export const PapelComPermissoesSchema = registry.register(
  "PapelComPermissoes",
  PapelSchema.extend({ permissoes: z.array(PermissaoItemSchema) }),
);

/** Item da listagem: `permissoes` só vem com `?incluir=permissoes`. */
export const PapelListaItemSchema = registry.register(
  "PapelListaItem",
  PapelSchema.extend({
    permissoes: z
      .array(PermissaoItemSchema)
      .optional()
      .openapi({ description: "Presente apenas com ?incluir=permissoes" }),
  }),
);

export const PapelIdParamSchema = z.object({ id: z.uuid() });

export const ListPapeisQuerySchema = z.object({
  nome: filtroTexto("Filtro por nome (contém)"),
  incluir: z
    .enum(["permissoes"])
    .optional()
    .openapi({ description: "`permissoes` anexa as permissões de cada papel (uma query extra, sem N+1)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_PAPEIS),
});

export const CreatePapelSchema = z.object({
  nome: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_-]*$/, "Use minúsculas, números, hífen e underscore (ex.: gestor-vendas)")
    .openapi({ example: "gestor-vendas" }),
  descricao: z.string().max(255).optional(),
  permissoes: z.array(PermissaoItemSchema).default([]),
});

export const UpdatePapelSchema = z.object({
  nome: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_-]*$/, "Use minúsculas, números, hífen e underscore (ex.: gestor-vendas)")
    .optional(),
  descricao: z.string().max(255).nullable().optional(),
});

export const PutPermissoesSchema = z.object({
  permissoes: z.array(PermissaoItemSchema),
});

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Papéis e permissões"];

registry.registerPath({
  method: "get",
  path: "/papeis",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar papéis (?incluir=permissoes anexa as permissões)",
  request: { query: ListPapeisQuerySchema },
  responses: { 200: okPagina(PapelListaItemSchema), ...ERROS.validacao, ...ERROS.autenticado },
});

registry.registerPath({
  method: "get",
  path: "/papeis/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um papel com suas permissões",
  request: { params: PapelIdParamSchema },
  responses: { 200: ok(PapelComPermissoesSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/papeis",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar papel (opcionalmente já com permissões)",
  request: { body: { content: { "application/json": { schema: CreatePapelSchema } } } },
  responses: {
    201: criado(PapelComPermissoesSchema),
    ...ERROS.validacao,
    ...ERROS.autenticado,
    ...ERROS.conflito,
  },
});

registry.registerPath({
  method: "patch",
  path: "/papeis/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary:
    "Alterar nome/descrição (renomear propaga para user.role via FK cascade; papéis de sistema não são renomeados)",
  request: {
    params: PapelIdParamSchema,
    body: { content: { "application/json": { schema: UpdatePapelSchema } } },
  },
  responses: { 200: ok(PapelComPermissoesSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "put",
  path: "/papeis/{id}/permissoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Substituir o conjunto de permissões do papel (efeito imediato — invalida o cache)",
  description:
    "409 se deixar um papel de sistema sem permissões ou se remover `manage Papel`/`manage all` do papel do próprio usuário.",
  request: {
    params: PapelIdParamSchema,
    body: { content: { "application/json": { schema: PutPermissoesSchema } } },
  },
  responses: { 200: ok(PapelComPermissoesSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "post",
  path: "/papeis/{id}/reativar",
  tags: TAG,
  security: SEGURANCA,
  summary: "Reativar um papel excluído (soft delete) — o nome volta a ficar disponível para uso",
  request: { params: PapelIdParamSchema },
  responses: {
    200: ok(PapelComPermissoesSchema),
    ...ERROS_ESCRITA,
    409: { description: "Papel não está excluído", content: ERROS.conflito[409].content },
  },
});

registry.registerPath({
  method: "delete",
  path: "/papeis/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir papel (soft delete; bloqueado se houver usuários com ele ou se for papel de sistema)",
  request: { params: PapelIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS.autenticado, ...ERROS.naoEncontrado, ...ERROS.conflito },
});
