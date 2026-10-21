import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { ERROS, filtroTexto, okPagina, paginacaoQuery } from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const MunicipioSchema = registry.register(
  "Municipio",
  z
    .object({
      id: z.number().int().openapi({ description: "Código IBGE do município (7 dígitos)" }),
      nome: z.string(),
      estadoId: z.number().int(),
    })
    .openapi({ description: "Município (dados do IBGE)" }),
);

export const ListMunicipiosQuerySchema = z.object({
  estadoId: z.coerce.number().int().optional(),
  nome: filtroTexto("Filtro por nome (contém)"),
  ...paginacaoQuery,
  // ~5.570 municípios no Brasil; o combobox pagina em lotes de até 500
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

registry.registerPath({
  method: "get",
  path: "/municipios",
  tags: ["Localização"],
  summary: "Listar municípios (filtre por estadoId para alimentar comboboxes)",
  request: { query: ListMunicipiosQuerySchema },
  responses: { 200: okPagina(MunicipioSchema, "Lista paginada de municípios"), ...ERROS.validacao },
});
