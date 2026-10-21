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

export const SORT_TIPOS_DOCUMENTO = ["nome", "ordem", "createdAt"] as const;

export const TipoDocumentoSchema = registry.register(
  "TipoDocumento",
  z
    .object({
      id: z.uuid(),
      nome: z.string(),
      obrigatorio: z.boolean(),
      porProjeto: z.boolean().openapi({
        description: "true = um documento por projeto (Termo de parceria); false = da associação (Estatuto)",
      }),
      ordem: z.number().int().openapi({ description: "Posição no checklist de documentos" }),
      ativo: z.boolean(),
    })
    .openapi({ description: "Tipo de documento exigido da associação (catálogo)" }),
);

export const TipoDocumentoIdParamSchema = z.object({ id: z.uuid() });

export const ListTiposDocumentoQuerySchema = z.object({
  busca: filtroTexto("Nome (contém)"),
  ativo: z.stringbool().optional().openapi({ description: "Filtra por status (true/false)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_TIPOS_DOCUMENTO),
});

const camposTipoDocumento = {
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  obrigatorio: z.boolean().optional(),
  porProjeto: z.boolean().optional(),
  ordem: z.number().int().min(0).max(32767).optional(),
  ativo: z.boolean().optional(),
};

export const CreateTipoDocumentoSchema = z.object(camposTipoDocumento);
export const UpdateTipoDocumentoSchema = z.object(camposTipoDocumento).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Tipos de documento"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/tipos-documento",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar tipos de documento (padrão: ordem do checklist)",
  request: { query: ListTiposDocumentoQuerySchema },
  responses: { 200: okPagina(TipoDocumentoSchema), ...ERROS.validacao, ...ERROS.autenticado },
});

registry.registerPath({
  method: "get",
  path: "/tipos-documento/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um tipo de documento",
  request: { params: TipoDocumentoIdParamSchema },
  responses: { 200: ok(TipoDocumentoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/tipos-documento",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar tipo de documento",
  request: { body: corpo(CreateTipoDocumentoSchema) },
  responses: {
    201: criado(TipoDocumentoSchema),
    ...ERROS.validacao,
    ...ERROS.autenticado,
    ...ERROS.conflito,
  },
});

registry.registerPath({
  method: "patch",
  path: "/tipos-documento/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar tipo de documento (porProjeto não muda se já houver documentos entregues)",
  request: { params: TipoDocumentoIdParamSchema, body: corpo(UpdateTipoDocumentoSchema) },
  responses: { 200: ok(TipoDocumentoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/tipos-documento/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir tipo de documento (bloqueado se houver documentos entregues — desative-o)",
  request: { params: TipoDocumentoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
