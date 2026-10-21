import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import OpcoesDiagnosticoRepository from "./opcoesDiagnostico.repository.ts";
import type {
  ListOpcoesDiagnosticoQuerySchema,
  CreateOpcaoDiagnosticoSchema,
  UpdateOpcaoDiagnosticoSchema,
} from "./opcoesDiagnostico.schema.ts";

type ListQuery = z.infer<typeof ListOpcoesDiagnosticoQuerySchema>;
type CreateData = z.infer<typeof CreateOpcaoDiagnosticoSchema>;
type UpdateData = z.infer<typeof UpdateOpcaoDiagnosticoSchema>;
type Grupo = CreateData["grupo"];

export default class OpcoesDiagnosticoService {
  private repository = new OpcoesDiagnosticoRepository();

  async listar(query: ListQuery) {
    const [itens, total] = await Promise.all([this.repository.listar(query), this.repository.contar(query)]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const encontrada = await this.repository.porId(id);
    if (!encontrada) throw new AppError("Opção de diagnóstico não encontrada", 404);
    return encontrada;
  }

  async criar(data: CreateData) {
    await this.garantirNomeLivre(data.grupo, data.nome);
    return this.repository.inserir(data);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.listarPorId(id);
    const grupo = data.grupo ?? atual.grupo;
    const nome = data.nome ?? atual.nome;
    if (grupo !== atual.grupo || nome.toLowerCase() !== atual.nome.toLowerCase()) {
      await this.garantirNomeLivre(grupo, nome, id);
    }
    // Marcações e eventos já apontam para a opção dentro do grupo atual (tema de evento = tema_capacitacao)
    if (grupo !== atual.grupo && (await this.repository.contarUsos(id)) > 0) {
      throw new AppError(
        `"${atual.nome}" já está em uso — não é possível mudá-la de grupo`,
        409,
        undefined,
        "OPCAO_DIAGNOSTICO_EM_USO",
      );
    }
    const alterada = await this.repository.alterar(id, data);
    if (!alterada) throw new AppError("Opção de diagnóstico não encontrada", 404);
    return alterada;
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    const usos = await this.repository.contarUsos(id);
    if (usos > 0) {
      throw new AppError(
        `"${atual.nome}" já foi usada em ${usos} diagnóstico(s) ou evento(s) — desative-a em vez de excluir`,
        409,
        undefined,
        "OPCAO_DIAGNOSTICO_EM_USO",
      );
    }
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Opção de diagnóstico não encontrada", 404);
  }

  private async garantirNomeLivre(grupo: Grupo, nome: string, excetoId?: string) {
    if (await this.repository.porGrupoNome(grupo, nome, excetoId)) {
      throw new AppError(
        `Já existe a opção "${nome}" neste grupo`,
        409,
        undefined,
        "OPCAO_DIAGNOSTICO_DUPLICADA",
      );
    }
  }
}
