import { pgTable, uuid, text, date, boolean, index } from "drizzle-orm/pg-core";
import { associacao } from "./associacao.ts";
import { visita } from "./visita.ts";
import { respostaDiagnosticoEnum } from "./enums.ts";
import { auditColumns } from "./audit.ts";

/**
 * Diagnóstico ÚNICO da associação, reaproveitado por todos os projetos (abas
 * Atividades, Solo, Capacitação, Apoio e Comentários da planilha). Reaplicar o
 * questionário atualiza a linha — as versões anteriores ficam no histórico.
 * PK = associação: diagnóstico excluído é reativado, não recriado.
 */
export const diagnosticoAssociacao = pgTable(
  "diagnosticos_associacao",
  {
    associacaoId: uuid("associacao_id")
      .primaryKey()
      .references(() => associacao.id, { onDelete: "cascade" }),
    // Última visita inicial que coletou/atualizou (de qualquer projeto)
    visitaId: uuid("visita_id").references(() => visita.id, { onDelete: "set null" }),
    coletadoEm: date("coletado_em").notNull(),
    analiseSoloRecente: respostaDiagnosticoEnum("analise_solo_recente"),
    acessoMaquinario: respostaDiagnosticoEnum("acesso_maquinario"),
    praticasConservacao: text("praticas_conservacao"),
    participouCursos: respostaDiagnosticoEnum("participou_cursos"),
    interesseCapacitacao: boolean("interesse_capacitacao"),
    possuiRegistroFormal: boolean("possui_registro_formal"),
    possuiLocalEventos: boolean("possui_local_eventos"),
    tipoLocalEventos: text("tipo_local_eventos"),
    potencialNaoExplorado: text("potencial_nao_explorado"),
    comentarios: text("comentarios"),
    revisado: boolean("revisado").notNull().default(false),
    ...auditColumns,
  },
  (t) => [index("diagnosticos_associacao_visita_idx").on(t.visitaId)],
);

export type DiagnosticoAssociacao = typeof diagnosticoAssociacao.$inferSelect;
export type NewDiagnosticoAssociacao = typeof diagnosticoAssociacao.$inferInsert;
