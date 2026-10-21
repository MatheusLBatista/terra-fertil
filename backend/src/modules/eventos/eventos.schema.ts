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
  okPagina,
  criado,
  semConteudo,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_EVENTOS = ["inicio", "titulo", "situacao", "createdAt"] as const;

export const TIPOS_EVENTO = ["curso", "oficina", "dia_de_campo", "palestra", "intercambio"] as const;
export const SITUACOES_EVENTO = ["planejado", "realizado", "cancelado"] as const;

const dataHora = () =>
  z.iso
    .datetime({ offset: true, error: "Data e hora inválidas" })
    .openapi({ example: "2026-03-10T08:00:00-04:00" });

export const EventoSchema = registry.register(
  "Evento",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      titulo: z.string(),
      tipo: z.enum(TIPOS_EVENTO),
      temaId: z.uuid().nullable(),
      temaNome: z.string().nullable(),
      associacaoId: z.uuid().nullable(),
      associacaoSigla: z.string().nullable(),
      municipioId: z.number().int(),
      municipioNome: z.string(),
      local: z.string().nullable(),
      inicio: z.string().openapi({ description: "Data e hora (ISO 8601, UTC)" }),
      fim: z.string().openapi({ description: "Data e hora (ISO 8601, UTC)" }),
      cargaHoraria: z.number().nullable().openapi({ description: "Horas" }),
      instrutor: z.string().nullable(),
      situacao: z.enum(SITUACOES_EVENTO),
      relato: z.string().nullable(),
      totalParticipantes: z.number().int(),
      totalPresentes: z.number().int(),
    })
    .openapi({ description: "Evento formativo do projeto (Meta 6): curso, oficina, dia de campo…" }),
);

export const EventoIdParamSchema = z.object({ id: z.uuid() });

export const ListEventosQuerySchema = z.object({
  projetoId: z.uuid().optional(),
  tipo: z.enum(TIPOS_EVENTO).optional(),
  situacao: z.enum(SITUACOES_EVENTO).optional(),
  associacaoId: z.uuid().optional(),
  municipioId: z.coerce.number().int().positive().optional(),
  de: z.iso.date().optional().openapi({ description: "Início a partir deste dia (YYYY-MM-DD)" }),
  ate: z.iso.date().optional().openapi({ description: "Início até este dia, inclusive (YYYY-MM-DD)" }),
  busca: filtroTexto("Título (contém)"),
  ...paginacaoQuery,
  sort: sortSchema(SORT_EVENTOS),
});

const camposEvento = {
  titulo: z.string().trim().min(1, "Informe o título").max(300),
  tipo: z.enum(TIPOS_EVENTO),
  temaId: z.uuid().nullable().optional().openapi({ description: "Opção do grupo tema_capacitacao" }),
  associacaoId: z
    .uuid()
    .nullable()
    .optional()
    .openapi({ description: "Comunidade anfitriã (com adesão ativa ao projeto)" }),
  municipioId: z.number().int().positive(),
  local: z.string().trim().max(300).nullable().optional(),
  inicio: dataHora(),
  fim: dataHora(),
  cargaHoraria: z
    .number()
    .positive("A carga horária deve ser maior que zero")
    .max(9999.9)
    .nullable()
    .optional()
    .openapi({ description: "Horas (uma casa decimal)" }),
  instrutor: z.string().trim().max(200).nullable().optional(),
  situacao: z.enum(SITUACOES_EVENTO).optional(),
  relato: z.string().trim().max(10_000).nullable().optional(),
};

const periodoValido = (v: { inicio?: string; fim?: string }) =>
  !v.inicio || !v.fim || new Date(v.fim) >= new Date(v.inicio);
export const MENSAGEM_PERIODO = "O fim não pode ser antes do início";

export const CreateEventoSchema = z
  .object({ projetoId: z.uuid(), ...camposEvento })
  .refine(periodoValido, { message: MENSAGEM_PERIODO, path: ["fim"] });

export const UpdateEventoSchema = z
  .object(camposEvento)
  .partial()
  .refine(periodoValido, { message: MENSAGEM_PERIODO, path: ["fim"] });

// ─── Participantes ───────────────────────────────────────────────────────────

export const ParticipanteSchema = registry.register(
  "EventoParticipante",
  z
    .object({
      produtorId: z.uuid(),
      nome: z.string(),
      telefone: z.string().nullable(),
      associacaoId: z.uuid().nullable().openapi({ description: "Associação principal do produtor" }),
      associacaoSigla: z.string().nullable(),
      presente: z.boolean(),
    })
    .openapi({ description: "Produtor na lista do evento (presente = capacitado)" }),
);

export const PutParticipantesSchema = z.object({
  participantes: z
    .array(z.object({ produtorId: z.uuid(), presente: z.boolean().default(false) }))
    .max(2000)
    .refine((l) => new Set(l.map((p) => p.produtorId)).size === l.length, {
      message: "O mesmo produtor aparece mais de uma vez na lista",
    }),
});

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Eventos"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const REFERENCIA_INVALIDA = {
  422: erro("Tema fora do grupo tema_capacitacao/inativo, associação sem adesão ativa ou produtor inativo"),
};

registry.registerPath({
  method: "get",
  path: "/eventos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar eventos (só os dos projetos do escopo do usuário)",
  request: { query: ListEventosQuerySchema },
  responses: { 200: okPagina(EventoSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/eventos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar um evento",
  request: { params: EventoIdParamSchema },
  responses: { 200: ok(EventoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/eventos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Criar evento",
  request: { body: corpo(CreateEventoSchema) },
  responses: { 201: criado(EventoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REFERENCIA_INVALIDA },
});

registry.registerPath({
  method: "patch",
  path: "/eventos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar evento",
  request: { params: EventoIdParamSchema, body: corpo(UpdateEventoSchema) },
  responses: { 200: ok(EventoSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REFERENCIA_INVALIDA },
});

registry.registerPath({
  method: "delete",
  path: "/eventos/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir evento (a lista de presença fica guardada, mas o evento some das leituras)",
  request: { params: EventoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "get",
  path: "/eventos/{id}/participantes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Lista de participantes do evento",
  request: { params: EventoIdParamSchema },
  responses: { 200: okLista(ParticipanteSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "put",
  path: "/eventos/{id}/participantes",
  tags: TAG,
  security: SEGURANCA,
  summary: "Substituir a lista de participantes (e a presença) do evento",
  request: { params: EventoIdParamSchema, body: corpo(PutParticipantesSchema) },
  responses: {
    200: okLista(ParticipanteSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    ...REFERENCIA_INVALIDA,
  },
});
