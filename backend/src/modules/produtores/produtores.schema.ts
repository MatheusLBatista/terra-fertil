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
import { cpfValido, somenteDigitos } from "../../lib/documentos.ts";
import {
  MENSAGEM_PESSOA,
  PessoaRefSchema,
  refinarPessoa,
  telefoneSchema,
} from "../pessoas/pessoas.schema.ts";

extendZodWithOpenApi(z);

export const SORT_PRODUTORES = ["nome", "createdAt"] as const;

/** CPF com ou sem máscara → só dígitos; dígito verificador inválido vira 400. */
export const cpfSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const d = somenteDigitos(v);
    if (!cpfValido(d)) {
      ctx.addIssue({ code: "custom", message: "CPF inválido" });
      return z.NEVER;
    }
    return d;
  })
  .openapi({ example: "529.982.247-25", description: "Com ou sem máscara; gravado só com dígitos" });

export const ProdutorSchema = registry.register(
  "Produtor",
  z
    .object({
      id: z.uuid(),
      userId: z.string().openapi({ description: "Usuário (pessoa) dono do perfil" }),
      nome: z.string(),
      email: z.string().nullable().openapi({ description: "Nulo quando a pessoa não tem e-mail" }),
      telefone: z.string().nullable().openapi({ description: "E.164 sem + (ex.: 5569993453103)" }),
      cpf: z.string().nullable().openapi({ description: "Só dígitos" }),
      observacao: z.string().nullable(),
      ativo: z.boolean(),
      totalPropriedades: z
        .number()
        .int()
        .openapi({ description: "Propriedades (não excluídas) visíveis ao usuário" }),
    })
    .openapi({ description: "Perfil de produtor (1:1 com o usuário) — compartilhado entre projetos" }),
);

export const ProdutorIdParamSchema = z.object({ id: z.uuid() });

export const ListProdutoresQuerySchema = z.object({
  busca: filtroTexto("Nome, CPF ou telefone (contém)"),
  associacaoId: z.uuid().optional().openapi({ description: "Produtores com propriedade nesta associação" }),
  ativo: z.stringbool().optional().openapi({ description: "Filtra por status (true/false)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_PRODUTORES),
});

const camposProdutor = {
  cpf: cpfSchema.nullable().optional(),
  observacao: z.string().trim().max(2000).nullable().optional(),
  ativo: z.boolean().optional(),
};

export const CreateProdutorSchema = z
  .object({ ...PessoaRefSchema, ...camposProdutor })
  .refine(refinarPessoa, { message: MENSAGEM_PESSOA, path: ["userId"] });

export const UpdateProdutorSchema = z.object({
  ...camposProdutor,
  // Dados da pessoa (tabela user) — só para quem tem apenas o papel produtor
  nome: z.string().trim().min(1, "Informe o nome").max(200).optional(),
  email: z
    .email("E-mail inválido")
    .transform((v) => v.toLowerCase())
    .nullable()
    .optional()
    .openapi({ description: "null remove o e-mail (a pessoa passa a ter um e-mail técnico)" }),
  telefone: telefoneSchema.nullable().optional(),
});

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Produtores"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/produtores",
  tags: TAG,
  security: SEGURANCA,
  summary:
    "Listar produtores (escopo: com propriedade em associação visível ou cadastrados pelo próprio usuário)",
  request: { query: ListProdutoresQuerySchema },
  responses: { 200: okPagina(ProdutorSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/produtores/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um produtor",
  request: { params: ProdutorIdParamSchema },
  responses: { 200: ok(ProdutorSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/produtores",
  tags: TAG,
  security: SEGURANCA,
  summary: "Cadastrar produtor (pessoa existente por userId ou nova por pessoa)",
  request: { body: corpo(CreateProdutorSchema) },
  responses: { 201: criado(ProdutorSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/produtores/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar produtor (CPF, observação, status e nome/e-mail/telefone da pessoa)",
  request: { params: ProdutorIdParamSchema, body: corpo(UpdateProdutorSchema) },
  responses: { 200: ok(ProdutorSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "post",
  path: "/produtores/{id}/reativar",
  tags: TAG,
  security: SEGURANCA,
  summary: "Reativar um perfil de produtor excluído (o usuário só pode ter um perfil)",
  request: { params: ProdutorIdParamSchema },
  responses: {
    200: ok(ProdutorSchema),
    ...ERROS_ESCRITA,
    409: { description: "Produtor não está excluído ou CPF já usado", content: ERROS.conflito[409].content },
  },
});

registry.registerPath({
  method: "delete",
  path: "/produtores/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir produtor (bloqueado se tiver propriedades)",
  request: { params: ProdutorIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
