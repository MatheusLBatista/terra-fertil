import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import OpcoesDiagnosticoRepository from "./opcoesDiagnostico.repository.ts";
import type {
  ListOpcoesDiagnosticoQuerySchema,
  CreateOpcaoDiagnosticoSchema,
  UpdateOpcaoDiagnosticoSchema,
  CreateSubdivisaoSchema,
  UpdateSubdivisaoSchema,
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
    if (
      grupo !== atual.grupo &&
      atual.grupo === "atividade_produtiva" &&
      (await this.repository.contarSubdivisoes(id)) > 0
    ) {
      throw new AppError(
        `"${atual.nome}" tem subdivisões — exclua-as antes de mudar a opção de grupo`,
        409,
        undefined,
        "OPCAO_COM_SUBDIVISOES",
      );
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
    if ((await this.repository.contarSubdivisoes(id)) > 0) {
      throw new AppError(
        `"${atual.nome}" tem subdivisões — exclua-as ou desative a opção`,
        409,
        undefined,
        "OPCAO_COM_SUBDIVISOES",
      );
    }
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

  // ─── Subdivisões ──────────────────────────────────────────────────────────

  async listarSubdivisoes(opcaoId: string) {
    await this.listarPorId(opcaoId);
    return this.repository.listarSubdivisoes(opcaoId);
  }

  async criarSubdivisao(opcaoId: string, data: z.infer<typeof CreateSubdivisaoSchema>) {
    const opcao = await this.listarPorId(opcaoId);
    if (opcao.grupo !== "atividade_produtiva") {
      throw new AppError("Só atividade produtiva tem subdivisões", 422, undefined, "OPCAO_SEM_SUBDIVISAO");
    }
    await this.garantirSubdivisaoLivre(opcaoId, data.nome);
    return this.repository.inserirSubdivisao({ ...data, opcaoId });
  }

  async alterarSubdivisao(opcaoId: string, id: string, data: z.infer<typeof UpdateSubdivisaoSchema>) {
    const atual = await this.buscarSubdivisao(opcaoId, id);
    if (data.nome && data.nome.toLowerCase() !== atual.nome.toLowerCase()) {
      await this.garantirSubdivisaoLivre(opcaoId, data.nome, id);
    }
    const alterada = await this.repository.alterarSubdivisao(id, data);
    if (!alterada) throw new AppError("Subdivisão não encontrada", 404);
    return alterada;
  }

  async excluirSubdivisao(opcaoId: string, id: string) {
    const atual = await this.buscarSubdivisao(opcaoId, id);
    if ((await this.repository.contarVerificacoesDaSubdivisao(id)) > 0) {
      throw new AppError(
        `"${atual.nome}" já foi verificada em visita — desative-a em vez de excluir`,
        409,
        undefined,
        "SUBDIVISAO_EM_USO",
      );
    }
    const excluida = await this.repository.excluirSubdivisao(id);
    if (!excluida) throw new AppError("Subdivisão não encontrada", 404);
  }

  private async buscarSubdivisao(opcaoId: string, id: string) {
    await this.listarPorId(opcaoId);
    const subdivisao = await this.repository.subdivisaoPorId(opcaoId, id);
    if (!subdivisao) throw new AppError("Subdivisão não encontrada", 404);
    return subdivisao;
  }

  private async garantirSubdivisaoLivre(opcaoId: string, nome: string, excetoId?: string) {
    if (await this.repository.subdivisaoPorNome(opcaoId, nome, excetoId)) {
      throw new AppError(
        `Já existe a subdivisão "${nome}" nesta atividade`,
        409,
        undefined,
        "SUBDIVISAO_DUPLICADA",
      );
    }
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
