import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { itemCategoriaEnum, itemTipoEnum } from "../../db/enums.ts";
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

export const SORT_ITENS = ["descricao", "tipo", "categoria", "createdAt"] as const;

export const TIPOS_ITEM = itemTipoEnum.enumValues;
export const CATEGORIAS_ITEM = itemCategoriaEnum.enumValues;

const centavos = () => z.number().int().min(0).openapi({ description: "Valor em centavos" });

export const ItemSchema = registry.register(
  "Item",
  z
    .object({
      id: z.uuid(),
      descricao: z.string(),
      tipo: z.enum(TIPOS_ITEM),
      categoria: z
        .enum(CATEGORIAS_ITEM)
        .openapi({ description: "Insumo, máquina, implemento ou equipamento" }),
      unidade: z.string().openapi({ example: "un" }),
      valorReferenciaCentavos: z
        .number()
        .int()
        .nullable()
        .openapi({ description: "Valor de referência em centavos" }),
      ativo: z.boolean(),
    })
    .openapi({
      description: "Máquina, implemento ou insumo (catálogo global, reaproveitado entre projetos)",
    }),
);

export const ItemIdParamSchema = z.object({ id: z.uuid() });

export const ListItensQuerySchema = z.object({
  busca: filtroTexto("Descrição (contém)"),
  tipo: z.enum(TIPOS_ITEM).optional(),
  categoria: z.enum(CATEGORIAS_ITEM).optional(),
  ativo: z.stringbool().optional().openapi({ description: "Filtra por status (true/false)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_ITENS),
});

const camposItem = {
  descricao: z.string().trim().min(1, "Informe a descrição").max(300),
  tipo: z.enum(TIPOS_ITEM),
  categoria: z.enum(CATEGORIAS_ITEM, { error: "Escolha a categoria" }),
  unidade: z.string().trim().min(1, "Informe a unidade").max(20).optional(),
  valorReferenciaCentavos: centavos().nullable().optional(),
  ativo: z.boolean().optional(),
};

export const CreateItemSchema = z.object(camposItem);
export const UpdateItemSchema = z.object(camposItem).partial();

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Itens"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/itens",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar itens do catálogo de equipamentos e insumos",
  request: { query: ListItensQuerySchema },
  responses: { 200: okPagina(ItemSchema), ...ERROS.validacao, ...ERROS.autenticado },
});

registry.registerPath({
  method: "get",
  path: "/itens/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um item",
  request: { params: ItemIdParamSchema },
  responses: { 200: ok(ItemSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/itens",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar item",
  request: { body: corpo(CreateItemSchema) },
  responses: { 201: criado(ItemSchema), ...ERROS.validacao, ...ERROS.autenticado, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/itens/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar item",
  request: { params: ItemIdParamSchema, body: corpo(UpdateItemSchema) },
  responses: { 200: ok(ItemSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/itens/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir item (bloqueado se houver entregas com ele — desative-o)",
  request: { params: ItemIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
