import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { okLista } from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const EstadoSchema = registry.register(
  "Estado",
  z
    .object({
      id: z.number().int().openapi({ description: "Código IBGE do estado" }),
      nome: z.string(),
      sigla: z.string(),
    })
    .openapi({ description: "Unidade federativa (dados do IBGE)" }),
);

registry.registerPath({
  method: "get",
  path: "/estados",
  tags: ["Localização"],
  summary: "Listar estados (27 UFs, ordenadas por nome)",
  responses: { 200: okLista(EstadoSchema) },
});
