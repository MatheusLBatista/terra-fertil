import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import {
  ERROS,
  ERROS_LEITURA,
  ERROS_ESCRITA,
  SEGURANCA,
  ok,
  okLista,
  okPagina,
  criado,
  semConteudo,
  erro,
  filtroTexto,
  paginacaoQuery,
  sortSchema,
} from "../../lib/openapi/helpers.ts";

extendZodWithOpenApi(z);

export const SORT_VISITAS = ["data", "tipo", "situacao", "createdAt"] as const;

export const TIPOS_VISITA = [
  "inicial_associacao",
  "diagnostico_propriedade",
  "assistencia_tecnica",
  "acompanhamento",
] as const;
export const SITUACOES_VISITA = ["agendada", "realizada", "cancelada"] as const;
export const TIPOS_ANEXO = ["foto", "documento", "audio"] as const;
export const RESPOSTAS_DIAGNOSTICO = ["sim", "nao", "parcialmente", "nao_sei"] as const;
export const GRUPOS_OPCAO = [
  "atividade_produtiva",
  "problema_solo",
  "tema_capacitacao",
  "parceiro_institucional",
  "apoio_necessario",
] as const;
/** Grupos de opção que o diagnóstico da PROPRIEDADE aceita (os demais são da associação). */
export const GRUPOS_DIAGNOSTICO_PROPRIEDADE = ["atividade_produtiva", "problema_solo"] as const;

const data = () => z.iso.date().openapi({ example: "2026-03-10" });
const texto = (max: number) => z.string().trim().max(max).nullable().optional();
const latitude = () => z.number().min(-90).max(90);
const longitude = () => z.number().min(-180).max(180);
const link = () =>
  z
    .url({ protocol: /^https?$/, error: "Informe um link http(s) válido" })
    .max(2000)
    .openapi({
      example: "https://exemplo.org/noticia",
    });

// ─── Visita ──────────────────────────────────────────────────────────────────

export const VisitaSchema = registry.register(
  "Visita",
  z
    .object({
      id: z.uuid(),
      projetoId: z.uuid(),
      projetoSigla: z.string(),
      tipo: z.enum(TIPOS_VISITA),
      situacao: z.enum(SITUACOES_VISITA),
      associacaoId: z.uuid().nullable().openapi({ description: "Só na visita inicial" }),
      associacaoSigla: z
        .string()
        .nullable()
        .openapi({ description: "Associação da visita inicial ou a que atende a propriedade" }),
      propriedadeId: z.uuid().nullable().openapi({ description: "Demais tipos" }),
      propriedadeNome: z.string().nullable(),
      produtorNome: z.string().nullable(),
      visitaAnteriorId: z.uuid().nullable().openapi({ description: "Acompanhamento → visita de origem" }),
      data: z.string().openapi({ description: "Prevista ou realizada (YYYY-MM-DD)" }),
      realizadaEm: z.string().nullable().openapi({ description: "Data-hora da conclusão (ISO 8601)" }),
      tecnicoId: z.string(),
      tecnicoNome: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      relato: z.string().nullable(),
      noticiaUrl: z.string().nullable(),
    })
    .openapi({ description: "Ida a campo — inicial na associação; as demais na propriedade" }),
);

export const VisitaIdParamSchema = z.object({ id: z.uuid() });

export const ListVisitasQuerySchema = z.object({
  projetoId: z.uuid().optional(),
  tipo: z.enum(TIPOS_VISITA).optional(),
  situacao: z.enum(SITUACOES_VISITA).optional(),
  associacaoId: z
    .uuid()
    .optional()
    .openapi({ description: "Visitas na associação ou em propriedades atendidas por ela" }),
  propriedadeId: z.uuid().optional(),
  tecnicoId: z.string().trim().min(1).optional(),
  de: data().optional().openapi({ description: "Data da visita a partir de (inclusive)" }),
  ate: data().optional().openapi({ description: "Data da visita até (inclusive)" }),
  busca: filtroTexto("Sigla da associação, nome da propriedade ou do produtor (contém)"),
  ...paginacaoQuery,
  sort: sortSchema(SORT_VISITAS),
});

const camposEditaveis = {
  situacao: z.enum(SITUACOES_VISITA).optional(),
  visitaAnteriorId: z.uuid().nullable().optional(),
  data: data(),
  realizadaEm: z.iso
    .datetime({ offset: true })
    .nullable()
    .optional()
    .openapi({ description: "Obrigatório com situação realizada — se faltar, vale o momento do registro" }),
  tecnicoId: z.string().trim().min(1, "Informe o técnico responsável"),
  latitude: latitude().nullable().optional(),
  longitude: longitude().nullable().optional(),
  relato: texto(10_000),
  noticiaUrl: link().nullable().optional(),
};

const coordenadasJuntas = (v: { latitude?: number | null; longitude?: number | null }) =>
  v.latitude === undefined || v.longitude === undefined || (v.latitude === null) === (v.longitude === null);
const MENSAGEM_COORDENADAS = { message: "Informe latitude e longitude juntas", path: ["latitude"] };

export const CreateVisitaSchema = z
  .object({
    id: z.uuid().optional().openapi({ description: "Opcional — o app pode gerar o id offline" }),
    projetoId: z.uuid(),
    tipo: z.enum(TIPOS_VISITA),
    associacaoId: z.uuid().nullable().optional(),
    propriedadeId: z.uuid().nullable().optional(),
    ...camposEditaveis,
  })
  .refine((v) => v.tipo !== "inicial_associacao" || (!!v.associacaoId && !v.propriedadeId), {
    message: "A visita inicial é na associação: informe a associação (e não a propriedade)",
    path: ["associacaoId"],
  })
  .refine((v) => v.tipo === "inicial_associacao" || (!!v.propriedadeId && !v.associacaoId), {
    message: "Esta visita é na propriedade: informe a propriedade (e não a associação)",
    path: ["propriedadeId"],
  })
  .refine((v) => !v.visitaAnteriorId || v.tipo === "acompanhamento", {
    message: "Só a visita de acompanhamento aponta uma visita anterior",
    path: ["visitaAnteriorId"],
  })
  .refine((v) => !v.realizadaEm || v.situacao === "realizada", {
    message: "Só a visita realizada tem data de realização",
    path: ["realizadaEm"],
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), MENSAGEM_COORDENADAS);

/**
 * Projeto, tipo e alvo são fixos depois de criada a visita: podem vir no corpo
 * (o formulário costuma reenviar tudo), mas um valor DIFERENTE do atual → 400.
 */
export const UpdateVisitaSchema = z
  .object({
    projetoId: z.uuid().optional().openapi({ description: "Fixo — só aceita o valor atual" }),
    tipo: z.enum(TIPOS_VISITA).optional().openapi({ description: "Fixo — só aceita o valor atual" }),
    associacaoId: z.uuid().nullable().optional().openapi({ description: "Fixo — só aceita o valor atual" }),
    propriedadeId: z.uuid().nullable().optional().openapi({ description: "Fixo — só aceita o valor atual" }),
    ...camposEditaveis,
    data: data().optional(),
    tecnicoId: camposEditaveis.tecnicoId.optional(),
  })
  .refine(coordenadasJuntas, MENSAGEM_COORDENADAS);

// ─── Equipe da visita ────────────────────────────────────────────────────────

export const VisitaMembroSchema = registry.register(
  "VisitaMembro",
  z
    .object({
      id: z.uuid(),
      visitaId: z.uuid(),
      userId: z.string(),
      nome: z.string(),
      email: z.string().nullable(),
    })
    .openapi({ description: "Pessoa que foi à visita além do técnico responsável" }),
);

export const PutEquipeSchema = z.object({
  userIds: z
    .array(z.string().trim().min(1))
    .max(50, "No máximo 50 pessoas")
    .openapi({ description: "Conjunto completo (substitui o atual). O técnico responsável é ignorado" }),
});

// ─── Anexos ──────────────────────────────────────────────────────────────────

export const VisitaAnexoSchema = registry.register(
  "VisitaAnexo",
  z
    .object({
      id: z.uuid(),
      visitaId: z.uuid(),
      tipo: z.enum(TIPOS_ANEXO),
      nomeArquivo: z.string(),
      mimeType: z.string(),
      tamanhoBytes: z.number().int(),
      legenda: z.string().nullable(),
      createdAt: z.string(),
    })
    .openapi({ description: "Foto ou documento da visita — o arquivo sai por GET .../arquivo" }),
);

export const AnexoIdParamSchema = z.object({ id: z.uuid(), anexoId: z.uuid() });

/** Campos de texto do multipart do upload (o arquivo vai no campo "arquivo"). */
export const AnexoFormSchema = z.object({
  legenda: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

// ─── Diagnóstico da propriedade ──────────────────────────────────────────────

const hectares = () => z.number().min(0).max(99_999_999.99).nullable().optional();
const resposta = () => z.enum(RESPOSTAS_DIAGNOSTICO).nullable().optional();

const camposDiagnostico = {
  areaProdutivaHa: hectares(),
  areaPastagemHa: hectares(),
  areaPreservadaHa: hectares(),
  principaisCulturas: texto(2000),
  rebanhoBovino: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  fonteAgua: texto(200),
  possuiEnergia: z.boolean().nullable().optional(),
  possuiIrrigacao: z.boolean().nullable().optional(),
  pessoasTrabalham: z.number().int().min(0).max(32_767).nullable().optional(),
  analiseSoloRecente: resposta(),
  acessoMaquinario: resposta(),
  comentarios: texto(10_000),
};

export const OpcaoMarcadaSchema = registry.register(
  "DiagnosticoPropriedadeOpcao",
  z.object({
    opcaoId: z.uuid(),
    grupo: z.enum(GRUPOS_OPCAO),
    nome: z.string(),
    detalhe: z.string().nullable(),
  }),
);

export const DiagnosticoPropriedadeSchema = registry.register(
  "DiagnosticoPropriedade",
  z
    .object({
      visitaId: z.uuid(),
      areaProdutivaHa: z.number().nullable(),
      areaPastagemHa: z.number().nullable(),
      areaPreservadaHa: z.number().nullable(),
      principaisCulturas: z.string().nullable(),
      rebanhoBovino: z.number().int().nullable(),
      fonteAgua: z.string().nullable(),
      possuiEnergia: z.boolean().nullable(),
      possuiIrrigacao: z.boolean().nullable(),
      pessoasTrabalham: z.number().int().nullable(),
      analiseSoloRecente: z.enum(RESPOSTAS_DIAGNOSTICO).nullable(),
      acessoMaquinario: z.enum(RESPOSTAS_DIAGNOSTICO).nullable(),
      comentarios: z.string().nullable(),
      opcoes: z.array(OpcaoMarcadaSchema),
    })
    .openapi({ description: "Questionário da visita de diagnóstico (1:1 com a visita)" }),
);

export const PutDiagnosticoSchema = z
  .object({
    ...camposDiagnostico,
    opcoes: z
      .array(
        z.object({
          opcaoId: z.uuid(),
          detalhe: z.string().trim().max(500).nullable().optional().openapi({
            description: 'Texto do "Outro" — só em opção com permiteDetalhe',
          }),
        }),
      )
      .max(200)
      .default([])
      .openapi({ description: "Atividades produtivas e problemas de solo marcados (substitui o conjunto)" }),
  })
  .refine((v) => new Set(v.opcoes.map((o) => o.opcaoId)).size === v.opcoes.length, {
    message: "Opção marcada mais de uma vez",
    path: ["opcoes"],
  });

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Visitas"];
const corpo = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const REGRA = { 422: erro("Regra de negócio violada (equipe, adesão, tipo da visita)") };

registry.registerPath({
  method: "get",
  path: "/visitas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Listar visitas (só as dos projetos do escopo do usuário)",
  request: { query: ListVisitasQuerySchema },
  responses: { 200: okPagina(VisitaSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/visitas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Detalhar uma visita",
  request: { params: VisitaIdParamSchema },
  responses: { 200: ok(VisitaSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/visitas",
  tags: TAG,
  security: SEGURANCA,
  summary: "Registrar visita (alvo conforme o tipo; associação com adesão ativa; técnico da equipe)",
  request: { body: corpo(CreateVisitaSchema) },
  responses: { 201: criado(VisitaSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REGRA },
});

registry.registerPath({
  method: "patch",
  path: "/visitas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Alterar visita (projeto, tipo e alvo são fixos)",
  request: { params: VisitaIdParamSchema, body: corpo(UpdateVisitaSchema) },
  responses: { 200: ok(VisitaSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REGRA },
});

registry.registerPath({
  method: "delete",
  path: "/visitas/{id}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir visita (bloqueado se tiver recomendações, análises, acompanhamentos ou diagnóstico)",
  request: { params: VisitaIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "get",
  path: "/visitas/{id}/equipe",
  tags: TAG,
  security: SEGURANCA,
  summary: "Equipe da visita (além do técnico responsável)",
  request: { params: VisitaIdParamSchema },
  responses: { 200: okLista(VisitaMembroSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "put",
  path: "/visitas/{id}/equipe",
  tags: TAG,
  security: SEGURANCA,
  summary: "Definir a equipe da visita (substitui o conjunto; só pessoas da equipe do projeto)",
  request: { params: VisitaIdParamSchema, body: corpo(PutEquipeSchema) },
  responses: { 200: okLista(VisitaMembroSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REGRA },
});

registry.registerPath({
  method: "get",
  path: "/visitas/{id}/anexos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Fotos e documentos da visita",
  request: { params: VisitaIdParamSchema },
  responses: { 200: okLista(VisitaAnexoSchema), ...ERROS_LEITURA },
});

registry.registerPath({
  method: "post",
  path: "/visitas/{id}/anexos",
  tags: TAG,
  security: SEGURANCA,
  summary: "Enviar foto ou documento (multipart: arquivo + legenda opcional; imagem ou PDF, até 20 MB)",
  request: {
    params: VisitaIdParamSchema,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            arquivo: z.string().openapi({ type: "string", format: "binary" }),
            legenda: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: criado(VisitaAnexoSchema),
    ...ERROS_ESCRITA,
    ...ERROS.conflito,
    413: erro("Arquivo muito grande"),
    415: erro("Tipo de arquivo não permitido"),
    502: erro("Falha ao enviar ao storage"),
  },
});

registry.registerPath({
  method: "get",
  path: "/visitas/{id}/anexos/{anexoId}/arquivo",
  tags: TAG,
  security: SEGURANCA,
  summary: "Baixar o arquivo do anexo (proxy autenticado — o bucket é privado)",
  request: { params: AnexoIdParamSchema },
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
  path: "/visitas/{id}/anexos/{anexoId}",
  tags: TAG,
  security: SEGURANCA,
  summary: "Excluir anexo",
  request: { params: AnexoIdParamSchema },
  responses: { 204: semConteudo(), ...ERROS_LEITURA, ...ERROS.conflito },
});

registry.registerPath({
  method: "get",
  path: "/visitas/{id}/diagnostico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Diagnóstico da propriedade (só em visita de diagnóstico)",
  request: { params: VisitaIdParamSchema },
  responses: { 200: ok(DiagnosticoPropriedadeSchema), ...ERROS_LEITURA, ...REGRA },
});

registry.registerPath({
  method: "put",
  path: "/visitas/{id}/diagnostico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Preencher/atualizar o diagnóstico da propriedade com as opções marcadas",
  request: { params: VisitaIdParamSchema, body: corpo(PutDiagnosticoSchema) },
  responses: { 200: ok(DiagnosticoPropriedadeSchema), ...ERROS_ESCRITA, ...ERROS.conflito, ...REGRA },
});
