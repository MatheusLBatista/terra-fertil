import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { CATEGORIAS_ITEM } from "../itens/itens.schema.ts";
import { registrarRotasAssinatura } from "../assinaturas/assinaturas.schema.ts";
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

export const SORT_ENTREGAS = ["situacao", "dataPrevista", "dataEntrega", "createdAt"] as const;
export const SITUACOES_ENTREGA = [
  "demandado",
  "aprovado",
  "em_compra",
  "comprado",
  "entregue",
  "cancelado",
] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });
const centavos = () => z.number().int().min(0).openapi({ description: "Valor em centavos" });

export const EntregaSchema = registry.register(
  "Entrega",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      associacaoId: z.uuid(),
      associacaoSigla: z.string(),
      itemId: z.uuid(),
      itemDescricao: z.string(),
      itemCategoria: z.enum(CATEGORIAS_ITEM),
      pedidoId: z.uuid().nullable(),
      pedidoNumero: z.string().nullable(),
      lote: z.string().nullable(),
      quantidade: z.number().int(),
      valorEstimadoCentavos: z.number().int().nullable(),
      valorConsolidadoCentavos: z.number().int().nullable(),
      situacao: z.enum(SITUACOES_ENTREGA),
      dataPrevista: z.string().nullable(),
      dataEntrega: z.string().nullable(),
      numeroSerie: z.string().nullable(),
      observacao: z.string().nullable(),
      temTermoUso: z
        .boolean()
        .openapi({ description: "Há termo de uso anexado (baixe em GET /entregas/{id}/termo-uso)" }),
      temAssinatura: z
        .boolean()
        .openapi({ description: "O termo de uso foi assinado (GET /entregas/{id}/assinatura)" }),
    })
    .openapi({ description: "Destinação de um item a uma associação — de demanda até a entrega" }),
);

export const EntregaIdParamSchema = z.object({ id: z.uuid() });

export const ListEntregasQuerySchema = z.object({
  projetoId: z.uuid().optional(),
  associacaoId: z.uuid().optional(),
  itemId: z.uuid().optional(),
  categoria: z.enum(CATEGORIAS_ITEM).optional().openapi({ description: "Categoria do item" }),
  pedidoId: z.uuid().optional(),
  situacao: z.enum(SITUACOES_ENTREGA).optional(),
  lote: filtroTexto("Lote (contém), ex.: “1ª Entrega de 2026”"),
  busca: filtroTexto("Sigla da associação ou descrição do item (contém)"),
  ...paginacaoQuery,
  sort: sortSchema(SORT_ENTREGAS),
});

const camposEntrega = {
  associacaoId: z.uuid(),
  itemId: z.uuid(),
  pedidoId: z.uuid().nullable().optional(),
  lote: z.string().trim().max(200).nullable().optional(),
  quantidade: z.number().int().positive("A quantidade deve ser maior que zero").optional(),
  valorEstimadoCentavos: centavos().nullable().optional(),
  valorConsolidadoCentavos: centavos().nullable().optional(),
  situacao: z.enum(SITUACOES_ENTREGA).optional(),
  dataPrevista: data().nullable().optional(),
  dataEntrega: data().nullable().optional(),
  numeroSerie: z.string().trim().max(200).nullable().optional(),
  observacao: z.string().trim().max(2000).nullable().optional(),
};

/** Mensagens da regra "entregue ⇔ data da entrega" (também usadas pelo service no PATCH). */
export const MENSAGEM_SEM_DATA_ENTREGA = "Informe a data da entrega para marcar como entregue";
export const MENSAGEM_DATA_SEM_ENTREGUE = "A data da entrega só pode ser informada com a situação entregue";

export const CreateEntregaSchema = z
  .object({ projetoId: z.uuid(), ...camposEntrega })
  .refine((v) => v.situacao !== "entregue" || Boolean(v.dataEntrega), {
    message: MENSAGEM_SEM_DATA_ENTREGA,
    path: ["dataEntrega"],
  })
  .refine((v) => !v.dataEntrega || v.situacao === "entregue", {
    message: MENSAGEM_DATA_SEM_ENTREGUE,
    path: ["situacao"],
  });

export const UpdateEntregaSchema = z.object(camposEntrega).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Entregas"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const INCOMPATIVEL = {
  422: erro("Associação sem adesão ativa ao projeto, item inativo ou pedido de outro projeto"),
};

registry.registerPath({
  method: "get",
  path: "/entregas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar entregas (só as dos projetos do escopo)",
  request: { query: ListEntregasQuerySchema },
  responses: { 200: okPagina(EntregaSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/entregas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma entrega",
  request: { params: EntregaIdParamSchema },
  responses: { 200: ok(EntregaSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/entregas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar a destinação de um item a uma associação",
  request: { body: corpo(CreateEntregaSchema) },
  responses: { 201: criado(EntregaSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...INCOMPATIVEL },
});

registry.registerPath({
  method: "patch",
  path: "/entregas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar a entrega (situação “entregue” exige a data da entrega, e vice-versa)",
  request: { params: EntregaIdParamSchema, body: corpo(UpdateEntregaSchema) },
  responses: { 200: ok(EntregaSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...INCOMPATIVEL },
});

registry.registerPath({
  method: "delete",
  path: "/entregas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir a entrega (bloqueado se já conferida em visita de acompanhamento)",
  request: { params: EntregaIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

// ─── Termo de uso (arquivo privado, servido por proxy) ───────────────────────

registry.registerPath({
  method: "post",
  path: "/entregas/{id}/termo-uso",
  tags: TAG,
  security: SEGURANCA,
  summary: "Anexar o termo de uso (PDF ou imagem, até 20 MB) — substitui o anterior",
  request: {
    params: EntregaIdParamSchema,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ arquivo: z.string().openapi({ type: "string", format: "binary" }) }),
        },
      },
    },
  },
  responses: {
    200: ok(EntregaSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    413: erro("Arquivo muito grande"),
    415: erro("Tipo de arquivo não permitido"),
    502: erro("Falha ao enviar o arquivo ao storage"),
  },
});

registry.registerPath({
  method: "get",
  path: "/entregas/{id}/termo-uso",
  tags: TAG,
  security: SEGURANCA,
  summary: "Baixar o termo de uso (404 se não houver)",
  request: { params: EntregaIdParamSchema },
  responses: {
    200: {
      description: "Arquivo do termo de uso",
      content: { "application/octet-stream": { schema: z.string().openapi({ format: "binary" }) } },
    },
    ...ERROS_LEITURA,
  },
});

registry.registerPath({
  method: "delete",
  path: "/entregas/{id}/termo-uso",
  tags: TAG,
  security: SEGURANCA,
  summary: "Remover o termo de uso da entrega",
  request: { params: EntregaIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registrarRotasAssinatura(
  "/entregas/{id}",
  TAG,
  EntregaIdParamSchema,
  "Entrega ainda não entregue ou papel de proprietário (o termo é assinado pela associação)",
);
