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

export const SORT_PEDIDOS_COMPRA = ["numero", "dataPedido", "createdAt"] as const;
export const SITUACOES_PEDIDO = ["aberto", "em_compra", "concluido", "cancelado"] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });

export const PedidoCompraSchema = registry.register(
  "PedidoCompra",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      numero: z.string(),
      descricao: z.string().nullable(),
      fornecedor: z.string().nullable(),
      situacao: z.enum(SITUACOES_PEDIDO),
      dataPedido: z.string().nullable(),
      totalEntregas: z.number().int().openapi({ description: "Entregas (não excluídas) ligadas ao pedido" }),
      valorConsolidadoCentavos: z
        .number()
        .int()
        .openapi({ description: "Soma do valor consolidado das entregas do pedido, em centavos" }),
    })
    .openapi({ description: "Processo de compra com recurso do projeto — atende várias associações" }),
);

export const PedidoCompraIdParamSchema = z.object({ id: z.uuid() });

export const ListPedidosCompraQuerySchema = z.object({
  projetoId: z.uuid().optional(),
  situacao: z.enum(SITUACOES_PEDIDO).optional(),
  busca: filtroTexto("Número, fornecedor ou descrição (contém)"),
  ...paginacaoQuery,
  sort: sortSchema(SORT_PEDIDOS_COMPRA),
});

const camposPedido = {
  numero: z.string().trim().min(1, "Informe o número do pedido").max(60),
  descricao: z.string().trim().max(2000).nullable().optional(),
  fornecedor: z.string().trim().max(200).nullable().optional(),
  situacao: z.enum(SITUACOES_PEDIDO).optional(),
  dataPedido: data().nullable().optional(),
};

export const CreatePedidoCompraSchema = z.object({ projetoId: z.uuid(), ...camposPedido });
export const UpdatePedidoCompraSchema = z.object(camposPedido).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Pedidos de compra"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/pedidos-compra",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar pedidos de compra (só os dos projetos do escopo)",
  request: { query: ListPedidosCompraQuerySchema },
  responses: { 200: okPagina(PedidoCompraSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/pedidos-compra/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um pedido de compra",
  request: { params: PedidoCompraIdParamSchema },
  responses: { 200: ok(PedidoCompraSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/pedidos-compra",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar pedido de compra (número único)",
  request: { body: corpo(CreatePedidoCompraSchema) },
  responses: { 201: criado(PedidoCompraSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/pedidos-compra/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar pedido de compra",
  request: { params: PedidoCompraIdParamSchema, body: corpo(UpdatePedidoCompraSchema) },
  responses: { 200: ok(PedidoCompraSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/pedidos-compra/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir pedido de compra (bloqueado se houver entregas ligadas a ele)",
  request: { params: PedidoCompraIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
