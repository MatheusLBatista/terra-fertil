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
  okLista,
  criado,
  semConteudo,
} from "../../lib/openapi/helpers.ts";
import { LISTA_CHAVES } from "./apuracao.ts";

extendZodWithOpenApi(z);

export const SITUACOES_META = ["nao_iniciado", "em_execucao", "concluido"] as const;
export const TIPOS_APURACAO = ["automatica", "manual"] as const;

const INT_MAX = 2_147_483_647;
const peso = () =>
  z
    .number()
    .min(0, "O peso vai de 0 a 100")
    .max(100, "O peso vai de 0 a 100")
    .openapi({ description: "Peso (0–100)" });
const ordem = () => z.number().int().min(0).max(32_767).openapi({ description: "Posição na tela" });

export const ChaveApuracaoSchema = z
  .enum(LISTA_CHAVES, { error: "Chave de apuração fora da lista permitida (GET /metas/chaves)" })
  .openapi({ description: "Chave da allowlist de apuração automática" });

// ─── Respostas ───────────────────────────────────────────────────────────────

export const EtapaSchema = registry.register(
  "EtapaIndicador",
  z.object({
    id: z.uuid(),
    indicadorId: z.uuid(),
    descricao: z.string(),
    quantidadePrevista: z.number().int(),
    peso: z.number(),
    apuracao: z.enum(TIPOS_APURACAO),
    chave: z.string().nullable(),
    quantidadeManual: z.number().int().nullable(),
    ordem: z.number().int(),
  }),
);

export const EtapaApuradaSchema = registry.register(
  "EtapaApurada",
  EtapaSchema.extend({
    executado: z.number().openapi({ description: "Executado real (pode passar do previsto)" }),
    percentual: z.number().openapi({ description: "min(executado ÷ previsto, 1) × peso da etapa" }),
  }),
);

export const IndicadorSchema = registry.register(
  "Indicador",
  z.object({ id: z.uuid(), metaId: z.uuid(), descricao: z.string(), ordem: z.number().int() }),
);

export const IndicadorApuradoSchema = registry.register(
  "IndicadorApurado",
  IndicadorSchema.extend({
    percentual: z.number().openapi({ description: "Σ % das etapas do indicador" }),
    etapas: z.array(EtapaApuradaSchema),
  }),
);

export const MetaSchema = registry.register(
  "Meta",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      numero: z.number().int(),
      descricao: z.string(),
      valorAprovadoCentavos: z.number().int(),
      peso: z.number(),
      situacao: z.enum(SITUACOES_META),
      percentual: z.number().openapi({ description: "% concluída da meta (0–100) — calculada" }),
      indicadores: z.array(IndicadorApuradoSchema),
    })
    .openapi({ description: "Meta do projeto com indicadores, etapas e a apuração calculada" }),
);

export const ChaveApuracaoItemSchema = registry.register(
  "ChaveApuracao",
  z.object({ chave: z.string(), descricao: z.string() }),
);

// ─── Entrada ─────────────────────────────────────────────────────────────────

export const MetaIdParamSchema = z.object({ id: z.uuid() });
export const IndicadorIdParamSchema = z.object({ indicadorId: z.uuid() });
export const EtapaIdParamSchema = z.object({ etapaId: z.uuid() });

export const ListMetasQuerySchema = z.object({
  projetoId: z.uuid({ error: "Informe o projeto (projetoId)" }),
});

const camposMeta = {
  numero: z.number().int().min(1, "O número da meta deve ser maior que zero").max(32_767),
  descricao: z.string().trim().min(1, "Informe a descrição").max(2000),
  valorAprovadoCentavos: z.number().int().min(0).openapi({ description: "Valor em centavos" }),
  peso: peso(),
  situacao: z.enum(SITUACOES_META).optional(),
};

export const CreateMetaSchema = z.object({ projetoId: z.uuid(), ...camposMeta });
export const UpdateMetaSchema = z.object(camposMeta).partial();

const camposIndicador = {
  descricao: z.string().trim().min(1, "Informe a descrição").max(2000),
  ordem: ordem().optional(),
};

export const CreateIndicadorSchema = z.object(camposIndicador);
export const UpdateIndicadorSchema = z.object(camposIndicador).partial();

const quantidadeManual = () => z.number().int().min(0, "A quantidade não pode ser negativa").max(INT_MAX);

const camposEtapa = {
  descricao: z.string().trim().min(1, "Informe a descrição").max(2000),
  quantidadePrevista: z.number().int().min(1, "A quantidade prevista deve ser maior que zero").max(INT_MAX),
  peso: peso(),
  apuracao: z.enum(TIPOS_APURACAO),
  chave: ChaveApuracaoSchema.nullable().optional(),
  quantidadeManual: quantidadeManual().nullable().optional(),
  ordem: ordem().optional(),
};

export const CreateEtapaSchema = z.object(camposEtapa).superRefine((v, ctx) => {
  if (v.apuracao === "automatica" && !v.chave) {
    ctx.addIssue({ code: "custom", path: ["chave"], message: "Etapa automática precisa de uma chave" });
  }
  if (v.apuracao === "manual" && v.chave) {
    ctx.addIssue({ code: "custom", path: ["chave"], message: "Etapa manual não tem chave de apuração" });
  }
  if (v.apuracao === "automatica" && v.quantidadeManual != null) {
    ctx.addIssue({
      code: "custom",
      path: ["quantidadeManual"],
      message: "Quantidade manual só vale para etapa manual",
    });
  }
});

/** PATCH: a coerência apuração × chave × quantidade é checada no service (sobre o estado final). */
export const UpdateEtapaSchema = z.object(camposEtapa).partial();

export const QuantidadeManualSchema = z.object({ quantidadeManual: quantidadeManual().nullable() });

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Metas"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });

const respostaMetaComAvisos = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: z.object({
        data: MetaSchema,
        meta: z.object({
          avisos: z
            .array(z.string())
            .openapi({ description: "Avisos que não bloqueiam (ex.: Σ pesos das metas acima de 100)" }),
        }),
        erros: z.array(z.string()),
      }),
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/metas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Metas do projeto com indicadores, etapas e a apuração calculada",
  request: { query: ListMetasQuerySchema },
  responses: {
    200: {
      description: "Metas ordenadas por número; `meta` traz o % do projeto e o valor aprovado total",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(MetaSchema),
            meta: z.object({
              percentualProjeto: z.number().openapi({ description: "Σ (% da meta × peso da meta ÷ 100)" }),
              valorAprovadoTotalCentavos: z.number().int(),
            }),
            erros: z.array(z.string()),
          }),
        },
      },
    },
    ...ERROS.validacao,
    ...ERROS_LEITURA,
  },
});

registry.registerPath({
  method: "get",
  path: "/metas/chaves",
  tags: TAG,
  security: SEGURANCA,
  summary: "Chaves de apuração automática permitidas (allowlist)",
  responses: { 200: okLista(ChaveApuracaoItemSchema), ...ERROS.autenticado },
});

registry.registerPath({
  method: "get",
  path: "/metas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma meta (com indicadores, etapas e apuração)",
  request: { params: MetaIdParamSchema },
  responses: { 200: ok(MetaSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/metas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar meta (número único no projeto)",
  request: { body: corpo(CreateMetaSchema) },
  responses: { 201: respostaMetaComAvisos("Criada"), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/metas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar meta",
  request: { params: MetaIdParamSchema, body: corpo(UpdateMetaSchema) },
  responses: { 200: respostaMetaComAvisos("Alterada"), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/metas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir meta com indicadores e etapas (bloqueado se houver produções ou lançamentos nela)",
  request: { params: MetaIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "post",
  path: "/metas/{id}/indicadores",
  tags: TAG,
  security: SEGURANCA,
  summary: "Incluir indicador na meta",
  request: { params: MetaIdParamSchema, body: corpo(CreateIndicadorSchema) },
  responses: { 201: criado(IndicadorSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/metas/indicadores/{indicadorId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar indicador",
  request: { params: IndicadorIdParamSchema, body: corpo(UpdateIndicadorSchema) },
  responses: { 200: ok(IndicadorSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "delete",
  path: "/metas/indicadores/{indicadorId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir indicador (com as etapas)",
  request: { params: IndicadorIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "post",
  path: "/metas/indicadores/{indicadorId}/etapas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Incluir etapa no indicador (automática exige chave da allowlist)",
  request: { params: IndicadorIdParamSchema, body: corpo(CreateEtapaSchema) },
  responses: { 201: criado(EtapaSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "patch",
  path: "/metas/etapas/{etapaId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar etapa",
  request: { params: EtapaIdParamSchema, body: corpo(UpdateEtapaSchema) },
  responses: { 200: ok(EtapaSchema), ...ERROS_ESCRITA, ...ERROS.conflito },
});

registry.registerPath({
  method: "put",
  path: "/metas/etapas/{etapaId}/quantidade",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar o executado de uma etapa manual",
  request: { params: EtapaIdParamSchema, body: corpo(QuantidadeManualSchema) },
  responses: {
    200: ok(EtapaSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    422: erro("Etapa automática — o executado vem dos registros"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/metas/etapas/{etapaId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir etapa",
  request: { params: EtapaIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});
