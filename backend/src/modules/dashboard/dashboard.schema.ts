import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { registry } from "../../lib/openapi/registry.ts";
import { ERROS, ERROS_LEITURA, SEGURANCA, ok } from "../../lib/openapi/helpers.ts";
import { SITUACOES_ENTREGA } from "../entregas/entregas.schema.ts";
import { TIPOS_VISITA } from "../visitas/visitas.schema.ts";

extendZodWithOpenApi(z);

const hoje = () =>
  z.iso
    .date()
    .optional()
    .openapi({ description: "Data de hoje no fuso de quem consulta (YYYY-MM-DD); padrão: a do servidor" });

export const DashboardGestaoQuerySchema = z.object({ projetoId: z.uuid(), hoje: hoje() });
export const DashboardTecnicoQuerySchema = z.object({ hoje: hoje() });

/** Lista curta de pendências: as primeiras + o total (o link leva à tela completa). */
const lista = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ total: z.number().int(), itens: z.array(item) });

const VisitaResumoSchema = registry.register(
  "VisitaResumo",
  z.object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_VISITA),
    data: z.string(),
    onde: z.string().openapi({ description: "Sigla da associação ou produtor — propriedade" }),
    projetoSigla: z.string(),
    tecnicoNome: z.string(),
  }),
);

export const DashboardGestaoSchema = registry.register(
  "DashboardGestao",
  z
    .object({
      indicadores: z.object({
        visitasMes: z.number().int().openapi({ description: "Realizadas no mês de `hoje`" }),
        visitasMesAnterior: z.number().int(),
        entregasEntregues: z.number().int(),
        entregasDemandadas: z.number().int().openapi({ description: "Todas as não canceladas" }),
        associacoesVisitadas: z.number().int().openapi({ description: "Com visita inicial realizada" }),
        associacoes: z.number().int().openapi({ description: "Com adesão ativa ao projeto" }),
        liberadoCentavos: z.number().int(),
        gastoCentavos: z.number().int(),
      }),
      funil: z.object({
        situacoes: z.array(z.object({ situacao: z.enum(SITUACOES_ENTREGA), total: z.number().int() })),
        termoAssinado: z.number().int().openapi({ description: "Entregues com o termo de uso assinado" }),
      }),
      pendencias: z.object({
        documentos: lista(
          z.object({
            id: z.uuid(),
            associacaoId: z.uuid(),
            associacaoSigla: z.string(),
            tipoDocumento: z.string(),
            situacao: z.string(),
            validade: z.string().nullable(),
          }),
        ).openapi({ description: "Pendentes, rejeitados ou com validade nos próximos 30 dias" }),
        entregasSemAssinatura: lista(
          z.object({
            id: z.uuid(),
            itemDescricao: z.string(),
            associacaoSigla: z.string(),
            dataEntrega: z.string().nullable(),
          }),
        ),
        visitasSemAssinatura: lista(VisitaResumoSchema).openapi({
          description: "Acompanhamentos na associação e assistências realizados sem assinatura",
        }),
        recomendacoesVencidas: lista(
          z.object({
            id: z.uuid(),
            descricao: z.string(),
            prazo: z.string(),
            visitaId: z.uuid(),
            onde: z.string(),
          }),
        ),
      }),
    })
    .openapi({ description: "Visão de gestão de um projeto: números, funil das entregas e pendências" }),
);

export const DashboardTecnicoSchema = registry.register(
  "DashboardTecnico",
  z
    .object({
      realizadasMes: z.number().int(),
      proximas: lista(VisitaResumoSchema),
      atrasadas: lista(VisitaResumoSchema).openapi({ description: "Agendadas com a data já passada" }),
      paraFechar: lista(
        VisitaResumoSchema.extend({
          faltaRelato: z.boolean(),
          faltaFoto: z.boolean(),
          faltaAssinatura: z.boolean(),
        }),
      ).openapi({ description: "Realizadas sem relato, sem foto ou (as que se assinam) sem assinatura" }),
      recomendacoes: lista(
        z.object({
          id: z.uuid(),
          descricao: z.string(),
          prazo: z.string(),
          vencida: z.boolean(),
          visitaId: z.uuid(),
          onde: z.string(),
        }),
      ).openapi({ description: "Dadas nas minhas visitas, ainda abertas, com prazo nos próximos 15 dias" }),
    })
    .openapi({ description: "Visão do técnico: só as visitas em que ele é o responsável ou está na equipe" }),
);

// ─── OpenAPI ─────────────────────────────────────────────────────────────────

const TAG = ["Dashboard"];

registry.registerPath({
  method: "get",
  path: "/dashboard/gestao",
  tags: TAG,
  security: SEGURANCA,
  summary: "Dashboard de gestão do projeto",
  request: { query: DashboardGestaoQuerySchema },
  responses: { 200: ok(DashboardGestaoSchema), ...ERROS.validacao, ...ERROS_LEITURA },
});

registry.registerPath({
  method: "get",
  path: "/dashboard/tecnico",
  tags: TAG,
  security: SEGURANCA,
  summary: "Dashboard do técnico (as visitas dele)",
  request: { query: DashboardTecnicoQuerySchema },
  responses: { 200: ok(DashboardTecnicoSchema), ...ERROS.validacao, ...ERROS.autenticado },
});
