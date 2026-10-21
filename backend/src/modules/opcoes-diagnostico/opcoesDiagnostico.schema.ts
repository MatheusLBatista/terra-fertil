import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { grupoOpcaoEnum } from "../../db/enums.ts";
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

export const SORT_OPCOES_DIAGNOSTICO = ["nome", "ordem", "grupo", "createdAt"] as const;

export const GRUPOS_OPCAO = grupoOpcaoEnum.enumValues;

const grupo = () =>
  z.enum(GRUPOS_OPCAO).openapi({ description: "Grupo do diagnóstico em que a opção aparece" });

export const OpcaoDiagnosticoSchema = registry.register(
  "OpcaoDiagnostico",
  z
    .object({
      id: z.uuid(),
      grupo: grupo(),
      nome: z.string(),
      permiteDetalhe: z.boolean().openapi({ description: 'true no "Outro" — a resposta pede um texto' }),
      ordem: z.number().int(),
      ativo: z.boolean(),
    })
    .openapi({ description: "Opção de múltipla escolha dos diagnósticos (catálogo)" }),
);

export const OpcaoDiagnosticoIdParamSchema = z.object({ id: z.uuid() });

export const ListOpcoesDiagnosticoQuerySchema = z.object({
  grupo: grupo().optional(),
  busca: filtroTexto("Nome (contém)"),
  ativo: z.stringbool().optional().openapi({ description: "Filtra por status (true/false)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_OPCOES_DIAGNOSTICO),
});

const camposOpcao = {
  grupo: grupo(),
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  permiteDetalhe: z.boolean().optional(),
  ordem: z.number().int().min(0).max(32767).optional(),
  ativo: z.boolean().optional(),
};

export const CreateOpcaoDiagnosticoSchema = z.object(camposOpcao);
export const UpdateOpcaoDiagnosticoSchema = z.object(camposOpcao).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Opções de diagnóstico"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/opcoes-diagnostico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar opções de diagnóstico (padrão: grupo e ordem)",
  request: { query: ListOpcoesDiagnosticoQuerySchema },
  responses: { 200: okPagina(OpcaoDiagnosticoSchema), ...ERROS.validacao, ...ERROS.autenticado },
});

registry.registerPath({
  method: "get",
  path: "/opcoes-diagnostico/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma opção de diagnóstico",
  request: { params: OpcaoDiagnosticoIdParamSchema },
  responses: { 200: ok(OpcaoDiagnosticoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/opcoes-diagnostico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar opção de diagnóstico (nome único dentro do grupo)",
  request: { body: corpo(CreateOpcaoDiagnosticoSchema) },
  responses: {
    201: criado(OpcaoDiagnosticoSchema),
    ...ERROS.validacao,
    ...ERROS.autenticado,
    ...ERROS.conflito,
  },
});

registry.registerPath({
  method: "patch",
  path: "/opcoes-diagnostico/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar opção de diagnóstico (o grupo não muda se a opção já estiver em uso)",
  request: { params: OpcaoDiagnosticoIdParamSchema, body: corpo(UpdateOpcaoDiagnosticoSchema) },
  responses: { 200: ok(OpcaoDiagnosticoSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/opcoes-diagnostico/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir opção (bloqueado se marcada em diagnósticos ou usada como tema de evento — desative-a)",
  request: { params: OpcaoDiagnosticoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
