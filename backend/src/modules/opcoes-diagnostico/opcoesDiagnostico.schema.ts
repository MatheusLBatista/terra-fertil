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
  okLista,
  okPagina,
  criado,
  semConteudo,
  erro,
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
      subdivisoes: z
        .number()
        .int()
        .openapi({ description: "Quantas subdivisões a opção tem (só atividade produtiva tem)" }),
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

// ─── Subdivisões (só de atividade produtiva) ─────────────────────────────────

export const SubdivisaoAtividadeSchema = registry.register(
  "SubdivisaoAtividade",
  z
    .object({
      id: z.uuid(),
      opcaoId: z.uuid(),
      nome: z.string(),
      ordem: z.number().int(),
      ativo: z.boolean(),
    })
    .openapi({ description: "Subdivisão de uma atividade produtiva (ex.: Pecuária leiteira → Ordenha)" }),
);

export const SubdivisaoIdParamSchema = z.object({ id: z.uuid(), subdivisaoId: z.uuid() });

const camposSubdivisao = {
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  ordem: z.number().int().min(0).max(32767).optional(),
  ativo: z.boolean().optional(),
};

export const CreateSubdivisaoSchema = z.object(camposSubdivisao);
export const UpdateSubdivisaoSchema = z.object(camposSubdivisao).partial();

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

registry.registerPath({
  method: "get",
  path: "/opcoes-diagnostico/{id}/subdivisoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Subdivisões da atividade produtiva (ativas e inativas, na ordem)",
  request: { params: OpcaoDiagnosticoIdParamSchema },
  responses: { 200: okLista(SubdivisaoAtividadeSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/opcoes-diagnostico/{id}/subdivisoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar subdivisão (só em opção do grupo atividade produtiva)",
  request: { params: OpcaoDiagnosticoIdParamSchema, body: corpo(CreateSubdivisaoSchema) },
  responses: {
    201: criado(SubdivisaoAtividadeSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    422: erro("A opção não é uma atividade produtiva"),
  },
});

registry.registerPath({
  method: "patch",
  path: "/opcoes-diagnostico/{id}/subdivisoes/{subdivisaoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar subdivisão",
  request: { params: SubdivisaoIdParamSchema, body: corpo(UpdateSubdivisaoSchema) },
  responses: { 200: ok(SubdivisaoAtividadeSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/opcoes-diagnostico/{id}/subdivisoes/{subdivisaoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir subdivisão (bloqueado se já verificada em visita — desative-a)",
  request: { params: SubdivisaoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
