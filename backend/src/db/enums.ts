import { pgEnum } from "drizzle-orm/pg-core";

// ─── Auditoria / Histórico ────────────────────────────────────────────────────

export const operacaoHistoricoEnum = pgEnum("operacao_historico", ["INSERT", "UPDATE", "DELETE"]);

// ─── Autorização (RBAC/CASL) ─────────────────────────────────────────────────

export const acaoPermissaoEnum = pgEnum("acao_permissao", ["manage", "create", "read", "update", "delete"]);

// ─── Projetos ────────────────────────────────────────────────────────────────

export const projetoSituacaoEnum = pgEnum("projeto_situacao", ["planejado", "em_execucao", "encerrado"]);

export const equipeTipoEnum = pgEnum("equipe_tipo", [
  "coordenador",
  "tecnico",
  "estudante",
  "administrativo",
]);

// ─── Associações ─────────────────────────────────────────────────────────────

export const contatoFuncaoEnum = pgEnum("contato_funcao", ["presidente", "contato", "outro"]);

export const documentoSituacaoEnum = pgEnum("documento_situacao", [
  "pendente",
  "recebido",
  "validado",
  "rejeitado",
]);

// ─── Visitas e diagnósticos ──────────────────────────────────────────────────

export const visitaTipoEnum = pgEnum("visita_tipo", [
  "inicial_associacao",
  "diagnostico_propriedade",
  "assistencia_tecnica",
  "acompanhamento",
]);

export const visitaSituacaoEnum = pgEnum("visita_situacao", ["agendada", "realizada", "cancelada"]);

export const respostaDiagnosticoEnum = pgEnum("resposta_diagnostico", [
  "sim",
  "nao",
  "parcialmente",
  "nao_sei",
]);

export const grupoOpcaoEnum = pgEnum("grupo_opcao", [
  "atividade_produtiva",
  "problema_solo",
  "tema_capacitacao",
  "parceiro_institucional",
  "apoio_necessario",
]);

export const anexoTipoEnum = pgEnum("anexo_tipo", ["foto", "documento", "audio"]);

export const recomendacaoCategoriaEnum = pgEnum("recomendacao_categoria", [
  "calagem",
  "adubacao",
  "manejo_solo",
  "manejo_cultura",
  "sanidade",
  "gestao",
  "outro",
]);

export const recomendacaoSituacaoEnum = pgEnum("recomendacao_situacao", [
  "pendente",
  "em_andamento",
  "adotada",
  "nao_adotada",
]);

// ─── Equipamentos ────────────────────────────────────────────────────────────

export const itemTipoEnum = pgEnum("item_tipo", ["investimento", "custeio"]);

export const pedidoSituacaoEnum = pgEnum("pedido_situacao", [
  "aberto",
  "em_compra",
  "concluido",
  "cancelado",
]);

export const entregaSituacaoEnum = pgEnum("entrega_situacao", [
  "demandado",
  "aprovado",
  "em_compra",
  "comprado",
  "entregue",
  "cancelado",
]);

// ─── Capacitação ─────────────────────────────────────────────────────────────

export const eventoTipoEnum = pgEnum("evento_tipo", [
  "curso",
  "oficina",
  "dia_de_campo",
  "palestra",
  "intercambio",
]);

export const eventoSituacaoEnum = pgEnum("evento_situacao", ["planejado", "realizado", "cancelado"]);

// ─── Metas e financeiro ──────────────────────────────────────────────────────

export const metaSituacaoEnum = pgEnum("meta_situacao", ["nao_iniciado", "em_execucao", "concluido"]);

export const apuracaoTipoEnum = pgEnum("apuracao_tipo", ["automatica", "manual"]);

export const lancamentoTipoEnum = pgEnum("lancamento_tipo", ["liberacao", "despesa"]);

// ─── Produção técnica ────────────────────────────────────────────────────────

export const producaoTipoEnum = pgEnum("producao_tipo", [
  "relatorio_tecnico_participativo",
  "relatorio_tecnico",
  "resumo_cientifico",
  "relatorio_pesquisa",
]);
