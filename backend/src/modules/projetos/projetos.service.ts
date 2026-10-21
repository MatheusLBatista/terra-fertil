import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto, invalidarCacheEscopo } from "../../lib/escopo.ts";
import PessoasService from "../pessoas/pessoas.service.ts";
import ProjetosRepository from "./projetos.repository.ts";
import type {
  ListProjetosQuerySchema,
  CreateProjetoSchema,
  UpdateProjetoSchema,
  CreateMembroSchema,
  UpdateMembroSchema,
  ListAdesoesQuerySchema,
  CreateAdesaoSchema,
  UpdateAdesaoSchema,
} from "./projetos.schema.ts";

type ListQuery = z.infer<typeof ListProjetosQuerySchema>;
type CreateData = z.infer<typeof CreateProjetoSchema>;
type UpdateData = z.infer<typeof UpdateProjetoSchema>;

/** Quem entra na equipe sem conta prévia nasce com este papel (acesso decidido pelo admin). */
const PAPEL_EQUIPE = "tecnico";

export default class ProjetosService {
  private repository = new ProjetosRepository();
  private pessoas = new PessoasService();

  async listar(query: ListQuery) {
    const escopo = await escopoAtual();
    const filtros = { ...query, escopo };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    return garantirProjeto(id);
  }

  async criar(data: CreateData) {
    await this.garantirSiglaLivre(data.sigla);
    return this.repository.inserir(data);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await garantirProjeto(id);
    // Encerrado só aceita reabrir (mudar a situação) — o resto é somente leitura
    const soReabre = Object.keys(data).every((k) => k === "situacao") && data.situacao !== "encerrado";
    if (atual.situacao === "encerrado" && !soReabre) {
      throw new AppError("Projeto encerrado é somente leitura", 409, undefined, "PROJETO_ENCERRADO");
    }
    if (data.sigla && data.sigla.toLowerCase() !== atual.sigla.toLowerCase()) {
      await this.garantirSiglaLivre(data.sigla);
    }
    const inicio = data.inicio ?? atual.inicio;
    const fim = data.fim ?? atual.fim;
    if (fim < inicio) throw new AppError("O fim não pode ser antes do início", 400);

    const alterado = await this.repository.alterar(id, data);
    if (!alterado) throw new AppError("Projeto não encontrado", 404);
    return alterado;
  }

  async excluir(id: string) {
    await garantirProjeto(id);
    const dependencias = await this.repository.contarDependencias(id);
    if (dependencias > 0) {
      throw new AppError(
        "Projeto já tem metas, equipe, associações ou registros — encerre-o em vez de excluir",
        409,
        undefined,
        "PROJETO_EM_USO",
      );
    }
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Projeto não encontrado", 404);
  }

  // ─── Equipe ───────────────────────────────────────────────────────────────

  async listarEquipe(projetoId: string) {
    await garantirProjeto(projetoId);
    return this.repository.listarEquipe(projetoId);
  }

  async incluirMembro(projetoId: string, { userId, pessoa, ...data }: z.infer<typeof CreateMembroSchema>) {
    await garantirProjeto(projetoId, { escrita: true });
    const membroId = await db.transaction(async (tx) => {
      const p = await this.pessoas.resolver({ userId, pessoa }, PAPEL_EQUIPE, tx);
      if (await this.repository.membroPorUsuario(projetoId, p.id, tx)) {
        throw new AppError(`${p.nome} já está na equipe deste projeto`, 409, undefined, "MEMBRO_DUPLICADO");
      }
      const { id } = await this.repository.inserirMembro({ projetoId, userId: p.id, ...data }, tx);
      return id;
    });
    invalidarCacheEscopo();
    return this.buscarMembro(projetoId, membroId);
  }

  async alterarMembro(projetoId: string, membroId: string, data: z.infer<typeof UpdateMembroSchema>) {
    await garantirProjeto(projetoId, { escrita: true });
    const atual = await this.buscarMembro(projetoId, membroId);
    const contratadoEm = data.contratadoEm !== undefined ? data.contratadoEm : atual.contratadoEm;
    const desligadoEm = data.desligadoEm !== undefined ? data.desligadoEm : atual.desligadoEm;
    if (contratadoEm && desligadoEm && desligadoEm < contratadoEm) {
      throw new AppError("O desligamento não pode ser antes da contratação", 400);
    }
    const alterado = await this.repository.alterarMembro(membroId, data);
    if (!alterado) throw new AppError("Membro da equipe não encontrado", 404);
    invalidarCacheEscopo();
    return this.buscarMembro(projetoId, membroId);
  }

  async excluirMembro(projetoId: string, membroId: string) {
    await garantirProjeto(projetoId, { escrita: true });
    await this.buscarMembro(projetoId, membroId);
    const excluido = await this.repository.excluirMembro(membroId);
    if (!excluido) throw new AppError("Membro da equipe não encontrado", 404);
    invalidarCacheEscopo();
  }

  private async buscarMembro(projetoId: string, membroId: string) {
    const membro = await this.repository.membroPorId(projetoId, membroId);
    if (!membro) throw new AppError("Membro da equipe não encontrado", 404);
    return membro;
  }

  // ─── Adesões ──────────────────────────────────────────────────────────────

  async listarAdesoes(projetoId: string, { busca, ...pagina }: z.infer<typeof ListAdesoesQuerySchema>) {
    await garantirProjeto(projetoId);
    const [itens, total] = await Promise.all([
      this.repository.listarAdesoes(projetoId, { busca, ...pagina }),
      this.repository.contarAdesoes(projetoId, busca),
    ]);
    return { itens, total };
  }

  async incluirAdesao(projetoId: string, { associacaoId, ...data }: z.infer<typeof CreateAdesaoSchema>) {
    await garantirProjeto(projetoId, { escrita: true });
    if (!(await this.repository.associacaoExiste(associacaoId))) {
      throw new AppError("Associação não encontrada", 404);
    }
    if (await this.repository.adesaoPorAssociacao(projetoId, associacaoId)) {
      throw new AppError("A associação já participa deste projeto", 409, undefined, "ADESAO_DUPLICADA");
    }
    const { id } = await this.repository.inserirAdesao({ projetoId, associacaoId, ...data });
    return this.buscarAdesao(projetoId, id);
  }

  async alterarAdesao(projetoId: string, adesaoId: string, data: z.infer<typeof UpdateAdesaoSchema>) {
    await garantirProjeto(projetoId, { escrita: true });
    await this.buscarAdesao(projetoId, adesaoId);
    const alterada = await this.repository.alterarAdesao(adesaoId, data);
    if (!alterada) throw new AppError("Adesão não encontrada", 404);
    return this.buscarAdesao(projetoId, adesaoId);
  }

  async excluirAdesao(projetoId: string, adesaoId: string) {
    await garantirProjeto(projetoId, { escrita: true });
    const adesao = await this.buscarAdesao(projetoId, adesaoId);
    const registros = await this.repository.contarRegistrosDaAssociacaoNoProjeto(
      projetoId,
      adesao.associacaoId,
    );
    if (registros > 0) {
      throw new AppError(
        `${adesao.sigla} já tem visitas ou entregas neste projeto — marque a adesão como inativa em vez de excluir`,
        409,
        undefined,
        "ADESAO_EM_USO",
      );
    }
    const excluida = await this.repository.excluirAdesao(adesaoId);
    if (!excluida) throw new AppError("Adesão não encontrada", 404);
  }

  private async buscarAdesao(projetoId: string, adesaoId: string) {
    const adesao = await this.repository.adesaoPorId(projetoId, adesaoId);
    if (!adesao) throw new AppError("Adesão não encontrada", 404);
    return adesao;
  }

  private async garantirSiglaLivre(sigla: string) {
    if (await this.repository.porSigla(sigla)) {
      throw new AppError(`Já existe um projeto "${sigla}"`, 409, undefined, "PROJETO_DUPLICADO");
    }
  }
}
