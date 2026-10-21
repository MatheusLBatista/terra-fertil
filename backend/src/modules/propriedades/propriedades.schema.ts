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

export const SORT_PROPRIEDADES = ["nome", "produtorNome", "createdAt"] as const;

export const PropriedadeSchema = registry.register(
  "Propriedade",
  z
    .object({
      id: z.uuid(),
      produtorId: z.uuid(),
      produtorNome: z.string(),
      associacaoId: z.uuid(),
      associacaoSigla: z.string(),
      nome: z.string().nullable(),
      municipioId: z.number().int(),
      municipioNome: z.string(),
      distrito: z.string().nullable(),
      endereco: z.string().nullable(),
      areaTotalHa: z.number().nullable(),
      areaProdutivaHa: z.number().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      car: z.string().nullable().openapi({ description: "Cadastro Ambiental Rural" }),
      ativo: z.boolean(),
    })
    .openapi({ description: "Unidade produtiva — entra no escopo pela associação que a atende" }),
);

export const PropriedadeIdParamSchema = z.object({ id: z.uuid() });

export const ListPropriedadesQuerySchema = z.object({
  busca: filtroTexto("Nome da propriedade ou do produtor (contém)"),
  produtorId: z.uuid().optional(),
  associacaoId: z.uuid().optional(),
  municipioId: z.coerce.number().int().positive().optional(),
  ativo: z.stringbool().optional().openapi({ description: "Filtra por status (true/false)" }),
  ...paginacaoQuery,
  sort: sortSchema(SORT_PROPRIEDADES),
});

const area = () =>
  z
    .number()
    .min(0, "A área não pode ser negativa")
    .max(99_999_999.99, "Área grande demais")
    .openapi({ description: "Hectares (2 casas)" });

const camposPropriedade = {
  produtorId: z.uuid(),
  associacaoId: z.uuid(),
  nome: z.string().trim().max(200).nullable().optional(),
  municipioId: z.number().int().positive().optional().openapi({
    description: "Código IBGE do município (padrão na criação: o município da associação)",
  }),
  distrito: z.string().trim().max(200).nullable().optional(),
  endereco: z.string().trim().max(500).nullable().optional(),
  areaTotalHa: area().nullable().optional(),
  areaProdutivaHa: area().nullable().optional(),
  latitude: z
    .number()
    .min(-90, "Latitude entre -90 e 90")
    .max(90, "Latitude entre -90 e 90")
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-180, "Longitude entre -180 e 180")
    .max(180, "Longitude entre -180 e 180")
    .nullable()
    .optional(),
  car: z.string().trim().max(60).nullable().optional(),
  ativo: z.boolean().optional(),
};

type Areas = { areaTotalHa?: number | null; areaProdutivaHa?: number | null };
type Coordenadas = { latitude?: number | null; longitude?: number | null };

export const areasValidas = ({ areaTotalHa, areaProdutivaHa }: Areas) =>
  areaTotalHa == null || areaProdutivaHa == null || areaProdutivaHa <= areaTotalHa;
export const MENSAGEM_AREAS = "A área produtiva não pode ser maior que a área total";

export const coordenadasValidas = ({ latitude, longitude }: Coordenadas) =>
  (latitude == null) === (longitude == null);
export const MENSAGEM_COORDENADAS = "Informe latitude e longitude juntas (ou nenhuma)";

export const CreatePropriedadeSchema = z
  .object(camposPropriedade)
  .refine(areasValidas, { message: MENSAGEM_AREAS, path: ["areaProdutivaHa"] })
  .refine(coordenadasValidas, { message: MENSAGEM_COORDENADAS, path: ["latitude"] });

// No PATCH só compara o que veio junto; o service confere contra o registro atual
export const UpdatePropriedadeSchema = z
  .object(camposPropriedade)
  .partial()
  .refine(areasValidas, { message: MENSAGEM_AREAS, path: ["areaProdutivaHa"] })
  .refine((v) => v.latitude === undefined || v.longitude === undefined || coordenadasValidas(v), {
    message: MENSAGEM_COORDENADAS,
    path: ["latitude"],
  });

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Propriedades"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

registry.registerPath({
  method: "get",
  path: "/propriedades",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar propriedades (só as de associações do escopo do usuário)",
  request: { query: ListPropriedadesQuerySchema },
  responses: { 200: okPagina(PropriedadeSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/propriedades/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma propriedade",
  request: { params: PropriedadeIdParamSchema },
  responses: { 200: ok(PropriedadeSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/propriedades",
  tags: TAG,
  security: SEGURANCA,
  summary: "Cadastrar propriedade (associação e produtor visíveis ao usuário)",
  request: { body: corpo(CreatePropriedadeSchema) },
  responses: { 201: criado(PropriedadeSchema), ...ERROS_ESCRITA },
});

registry.registerPath({
  method: "patch",
  path: "/propriedades/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar propriedade",
  request: { params: PropriedadeIdParamSchema, body: corpo(UpdatePropriedadeSchema) },
  responses: { 200: ok(PropriedadeSchema), ...ERROS_ESCRITA },
});

registry.registerPath({
  method: "delete",
  path: "/propriedades/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir propriedade (bloqueado se tiver visitas ou análises de solo)",
  request: { params: PropriedadeIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
