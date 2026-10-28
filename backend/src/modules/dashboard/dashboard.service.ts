import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto } from "../../lib/escopo.ts";
import { getCurrentUserId } from "../../lib/requestContext.ts";
import DashboardRepository from "./dashboard.repository.ts";
import type { DashboardGestaoQuerySchema, DashboardTecnicoQuerySchema } from "./dashboard.schema.ts";

/** Hoje do servidor (YYYY-MM-DD, hora local) — o painel manda o do fuso de quem consulta. */
function hojeServidor() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default class DashboardService {
  private repository = new DashboardRepository();

  async gestao({ projetoId, hoje = hojeServidor() }: z.infer<typeof DashboardGestaoQuerySchema>) {
    await garantirProjeto(projetoId);
    const [
      indicadores,
      funil,
      documentos,
      entregasSemAssinatura,
      visitasSemAssinatura,
      recomendacoesVencidas,
    ] = await Promise.all([
      this.repository.indicadores(projetoId, hoje),
      this.repository.funil(projetoId),
      this.repository.documentosPendentes(projetoId, hoje),
      this.repository.entregasSemAssinatura(projetoId),
      this.repository.visitasSemAssinatura(projetoId),
      this.repository.recomendacoesVencidas(projetoId, hoje),
    ]);
    return {
      indicadores,
      funil,
      pendencias: { documentos, entregasSemAssinatura, visitasSemAssinatura, recomendacoesVencidas },
    };
  }

  async tecnico({ hoje = hojeServidor() }: z.infer<typeof DashboardTecnicoQuerySchema>) {
    const userId = getCurrentUserId();
    if (!userId) throw new AppError("Não autenticado", 401);
    const escopo = await escopoAtual();
    const [realizadasMes, proximas, atrasadas, paraFechar, recomendacoes] = await Promise.all([
      this.repository.realizadasMes(userId, escopo, hoje),
      this.repository.agendadas(userId, escopo, hoje, true),
      this.repository.agendadas(userId, escopo, hoje, false),
      this.repository.paraFechar(userId, escopo),
      this.repository.recomendacoes(userId, escopo, hoje),
    ]);
    return { realizadasMes, proximas, atrasadas, paraFechar, recomendacoes };
  }
}
