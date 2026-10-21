import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import {
  ERROS,
  ERROS_LEITURA,
  ERROS_ESCRITA,
  SEGURANCA,
  erro,
  ok,
  okPagina,
  criado,
  semConteudo,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_PRODUCOES = ["titulo", "concluidaEm", "createdAt"] as const;

export const TIPOS_PRODUCAO = [
  "relatorio_tecnico_participativo",
  "relatorio_tecnico",
  "resumo_cientifico",
  "relatorio_pesquisa",
] as const;

const AutorSchema = z.object({ projetoEquipeId: z.uuid(), nome: z.string() });

export const ProducaoSchema = registry.register(
  "Producao",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      titulo: z.string(),
      tipo: z.enum(TIPOS_PRODUCAO),
      metaId: z.uuid().nullable(),
      metaNumero: z.number().int().nullable(),
      concluidaEm: z
        .string()
        .nullable()
        .openapi({ description: "Preenchida = concluída (conta para a meta)" }),
      url: z.string().nullable().openapi({ description: "Publicação externa" }),
      resumo: z.string().nullable(),
      temArquivo: z
        .boolean()
        .openapi({ description: "Há arquivo anexado (baixe por GET /producoes/{id}/arquivo)" }),
      autores: z.array(AutorSchema).openapi({ description: "Membros da equipe do projeto" }),
    })
    .openapi({ description: "Relatório ou publicação do projeto que conta para as metas (M1, M7, M8)" }),
);

export const ProducaoIdParamSchema = z.object({ id: z.uuid() });

export const ListProducoesQuerySchema = z.object({
  projetoId: z.uuid().optional(),
  tipo: z.enum(TIPOS_PRODUCAO).optional(),
  metaId: z.uuid().optional(),
  concluida: z.stringbool().optional().openapi({ description: "true = com data de conclusão" }),
  busca: filtroTexto("Título (contém)"),
  ...paginacaoQuery,
  sort: sortSchema(SORT_PRODUCOES),
});

const autoresIds = () =>
  z
    .array(z.uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, { message: "O mesmo autor aparece mais de uma vez" })
    .openapi({ description: "Ids de projeto_equipe (membros da equipe do MESMO projeto)" });

const camposProducao = {
  titulo: z.string().trim().min(1, "Informe o título").max(500),
  tipo: z.enum(TIPOS_PRODUCAO),
  metaId: z.uuid().nullable().optional().openapi({ description: "Meta do mesmo projeto" }),
  concluidaEm: z.iso.date().nullable().optional().openapi({ example: "2026-03-10" }),
  url: z.url("Link inválido").max(2000).nullable().optional(),
  resumo: z.string().trim().max(10_000).nullable().optional(),
  projetoEquipeIds: autoresIds().optional(),
};

export const CreateProducaoSchema = z.object({ projetoId: z.uuid(), ...camposProducao });

export const UpdateProducaoSchema = z
  .object(camposProducao)
  .partial()
  .openapi({ description: "Com `projetoEquipeIds`, substitui o conjunto de autores" });

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Produções"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const REFERENCIA_INVALIDA = {
  422: erro("Meta de outro projeto ou autor fora da equipe do projeto"),
};

registry.registerPath({
  method: "get",
  path: "/producoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar produções (só as dos projetos do escopo do usuário)",
  request: { query: ListProducoesQuerySchema },
  responses: { 200: okPagina(ProducaoSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/producoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma produção",
  request: { params: ProducaoIdParamSchema },
  responses: { 200: ok(ProducaoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/producoes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar produção (com os autores)",
  request: { body: corpo(CreateProducaoSchema) },
  responses: { 201: criado(ProducaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REFERENCIA_INVALIDA },
});

registry.registerPath({
  method: "patch",
  path: "/producoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar produção (projetoEquipeIds substitui os autores)",
  request: { params: ProducaoIdParamSchema, body: corpo(UpdateProducaoSchema) },
  responses: { 200: ok(ProducaoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REFERENCIA_INVALIDA },
});

registry.registerPath({
  method: "delete",
  path: "/producoes/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir produção",
  request: { params: ProducaoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "post",
  path: "/producoes/{id}/arquivo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Enviar o arquivo da produção (PDF ou imagem; substitui o anterior)",
  request: {
    params: ProducaoIdParamSchema,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ arquivo: z.string().openapi({ type: "string", format: "binary" }) }),
        },
      },
    },
  },
  responses: {
    200: ok(ProducaoSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    413: erro("Arquivo muito grande"),
    415: erro("Tipo de arquivo não permitido"),
    502: erro("Falha no storage"),
  },
});

registry.registerPath({
  method: "get",
  path: "/producoes/{id}/arquivo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Baixar o arquivo da produção (proxy autenticado)",
  request: { params: ProducaoIdParamSchema },
  responses: {
    200: {
      description: "Conteúdo do arquivo",
      content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } },
    },
    ...ERROS_LEITURA,
  },
});

registry.registerPath({
  method: "delete",
  path: "/producoes/{id}/arquivo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Remover o arquivo da produção",
  request: { params: ProducaoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
