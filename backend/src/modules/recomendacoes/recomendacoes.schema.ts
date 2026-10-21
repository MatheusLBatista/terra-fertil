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
  erro,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_RECOMENDACOES = ["prazo", "situacao", "createdAt"] as const;

export const CATEGORIAS_RECOMENDACAO = [
  "calagem",
  "adubacao",
  "manejo_solo",
  "manejo_cultura",
  "sanidade",
  "gestao",
  "outro",
] as const;
export const SITUACOES_RECOMENDACAO = ["pendente", "em_andamento", "adotada", "nao_adotada"] as const;

export const RecomendacaoSchema = registry.register(
  "Recomendacao",
  z
    .object({
      id: z.uuid(),
      visitaId: z.uuid().openapi({ description: "Visita de assistência técnica que gerou" }),
      visitaData: z.string(),
      projetoId: z.uuid().openapi({ description: "Projeto da visita (a recomendação herda)" }),
      propriedadeId: z.uuid(),
      propriedadeNome: z.string().nullable(),
      produtorNome: z.string(),
      categoria: z.enum(CATEGORIAS_RECOMENDACAO),
      cultura: z.string().nullable(),
      descricao: z.string(),
      prazo: z.string().nullable(),
      situacao: z.enum(SITUACOES_RECOMENDACAO),
      verificadaEmVisitaId: z
        .uuid()
        .nullable()
        .openapi({ description: "Visita de acompanhamento que conferiu a adoção" }),
    })
    .openapi({ description: "Orientação técnica dada numa visita de assistência" }),
);

export const RecomendacaoIdParamSchema = z.object({ id: z.uuid() });

export const ListRecomendacoesQuerySchema = z.object({
  projetoId: z.uuid().optional().openapi({ description: "Projeto da visita" }),
  propriedadeId: z.uuid().optional(),
  visitaId: z.uuid().optional(),
  situacao: z.enum(SITUACOES_RECOMENDACAO).optional(),
  categoria: z.enum(CATEGORIAS_RECOMENDACAO).optional(),
  ...paginacaoQuery,
  sort: sortSchema(SORT_RECOMENDACOES),
});

const camposRecomendacao = {
  categoria: z.enum(CATEGORIAS_RECOMENDACAO),
  cultura: z.string().trim().max(200).nullable().optional(),
  descricao: z.string().trim().min(1, "Descreva a recomendação").max(5000),
  prazo: z.iso.date().nullable().optional().openapi({ example: "2026-06-30" }),
  situacao: z.enum(SITUACOES_RECOMENDACAO).optional(),
  verificadaEmVisitaId: z.uuid().nullable().optional(),
};

export const CreateRecomendacaoSchema = z.object({
  id: z.uuid().optional().openapi({ description: "Opcional — o app pode gerar o id offline" }),
  visitaId: z.uuid(),
  ...camposRecomendacao,
});

/** A visita de origem (e a propriedade, derivada dela) não muda depois de criada. */
export const UpdateRecomendacaoSchema = z.object(camposRecomendacao).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Recomendações"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const REGRA = { 422: erro("Visita de tipo, propriedade ou projeto incompatível") };

registry.registerPath({
  method: "get",
  path: "/recomendacoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar recomendações (só as das visitas dos projetos do escopo)",
  request: { query: ListRecomendacoesQuerySchema },
  responses: { 200: okPagina(RecomendacaoSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/recomendacoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma recomendação",
  request: { params: RecomendacaoIdParamSchema },
  responses: { 200: ok(RecomendacaoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/recomendacoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar recomendação numa visita de assistência técnica",
  request: { body: corpo(CreateRecomendacaoSchema) },
  responses: { 201: criado(RecomendacaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REGRA },
});

registry.registerPath({
  method: "patch",
  path: "/recomendacoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar recomendação (situação, verificação no acompanhamento…)",
  request: { params: RecomendacaoIdParamSchema, body: corpo(UpdateRecomendacaoSchema) },
  responses: { 200: ok(RecomendacaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REGRA },
});

registry.registerPath({
  method: "delete",
  path: "/recomendacoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir recomendação",
  request: { params: RecomendacaoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
