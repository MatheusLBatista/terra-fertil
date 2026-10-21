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
  erro,
  semConteudo,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_ANALISES_SOLO = ["identificadaEm", "laudoRegistradoEm", "createdAt"] as const;

/** Situação DERIVADA: sem `laudoUrl` = pendente; com = laudo disponível. */
export const SITUACOES_ANALISE_SOLO = ["pendente", "com_laudo"] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });
const linkLaudo = () =>
  z
    .httpUrl("Informe um link http(s) válido")
    .max(2000)
    .openapi({ example: "https://drive.google.com/file/d/abc123", description: "Link externo do laudo" });

export const AnaliseSoloSchema = registry.register(
  "AnaliseSolo",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      propriedadeId: z.uuid(),
      propriedadeNome: z.string().nullable(),
      produtorNome: z.string(),
      associacaoId: z.uuid(),
      associacaoSigla: z.string(),
      visitaId: z.uuid().nullable(),
      identificadaEm: z.string(),
      observacao: z.string().nullable(),
      laudoUrl: z.string().nullable(),
      laudoRegistradoEm: z.string().nullable(),
      situacao: z.enum(SITUACOES_ANALISE_SOLO),
    })
    .openapi({ description: "Necessidade de análise de solo de uma propriedade e, depois, o link do laudo" }),
);

export const AnaliseSoloIdParamSchema = z.object({ id: z.uuid() });

export const ListAnalisesSoloQuerySchema = z.object({
  projetoId: z.uuid().optional(),
  propriedadeId: z.uuid().optional(),
  associacaoId: z.uuid().optional(),
  situacao: z.enum(SITUACOES_ANALISE_SOLO).optional(),
  busca: filtroTexto("Nome da propriedade ou do produtor (contém)"),
  de: data().optional().openapi({ description: "Identificada a partir de (YYYY-MM-DD, inclusive)" }),
  ate: data().optional().openapi({ description: "Identificada até (YYYY-MM-DD, inclusive)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_ANALISES_SOLO),
});

/** A data do laudo não existe sem o link (sem data com link → o service grava hoje). */
const MENSAGEM_LAUDO = {
  message: "A data do laudo só pode ser informada junto com o link",
  path: ["laudoRegistradoEm"],
};

const camposAnalise = {
  propriedadeId: z.uuid(),
  visitaId: z.uuid().nullable().optional(),
  identificadaEm: data(),
  observacao: z.string().trim().max(2000).nullable().optional(),
  laudoUrl: linkLaudo().nullable().optional(),
  laudoRegistradoEm: data().nullable().optional(),
};

export const CreateAnaliseSoloSchema = z
  .object({
    id: z.uuid().optional().openapi({ description: "Opcional — gerado no app (registro offline)" }),
    projetoId: z.uuid(),
    ...camposAnalise,
  })
  .refine((v) => !(v.laudoRegistradoEm && !v.laudoUrl), MENSAGEM_LAUDO);

export const UpdateAnaliseSoloSchema = z
  .object(camposAnalise)
  .partial()
  .refine((v) => !(v.laudoRegistradoEm && v.laudoUrl === null), MENSAGEM_LAUDO);

export const LaudoSchema = z
  .object({
    laudoUrl: linkLaudo().nullable().openapi({ description: "Link do laudo; `null` remove o laudo" }),
    laudoRegistradoEm: data()
      .optional()
      .openapi({ description: "Quando o link foi informado (padrão: hoje)" }),
  })
  .refine((v) => !(v.laudoRegistradoEm && v.laudoUrl === null), MENSAGEM_LAUDO);

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Análises de solo"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const INCOMPATIVEL = {
  422: erro("Associação da propriedade sem adesão ativa ao projeto, ou visita de outra propriedade/projeto"),
};

registry.registerPath({
  method: "get",
  path: "/analises-solo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar necessidades de análise de solo (só as dos projetos do escopo)",
  request: { query: ListAnalisesSoloQuerySchema },
  responses: { 200: okPagina(AnaliseSoloSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/analises-solo/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma necessidade de análise de solo",
  request: { params: AnaliseSoloIdParamSchema },
  responses: { 200: ok(AnaliseSoloSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/analises-solo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar a necessidade de análise de solo de uma propriedade",
  request: { body: corpo(CreateAnaliseSoloSchema) },
  responses: { 201: criado(AnaliseSoloSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...INCOMPATIVEL },
});

registry.registerPath({
  method: "patch",
  path: "/analises-solo/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar a necessidade de análise de solo",
  request: { params: AnaliseSoloIdParamSchema, body: corpo(UpdateAnaliseSoloSchema) },
  responses: { 200: ok(AnaliseSoloSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...INCOMPATIVEL },
});

registry.registerPath({
  method: "put",
  path: "/analises-solo/{id}/laudo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar (ou remover, com `laudoUrl: null`) o link do laudo",
  request: { params: AnaliseSoloIdParamSchema, body: corpo(LaudoSchema) },
  responses: { 200: ok(AnaliseSoloSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/analises-solo/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir a necessidade de análise de solo",
  request: { params: AnaliseSoloIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
