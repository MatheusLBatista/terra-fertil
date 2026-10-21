import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import TiposDocumentoRepository from "./tiposDocumento.repository.ts";
import type {
  ListTiposDocumentoQuerySchema,
  CreateTipoDocumentoSchema,
  UpdateTipoDocumentoSchema,
} from "./tiposDocumento.schema.ts";

type ListQuery = z.infer<typeof ListTiposDocumentoQuerySchema>;
type CreateData = z.infer<typeof CreateTipoDocumentoSchema>;
type UpdateData = z.infer<typeof UpdateTipoDocumentoSchema>;

export default class TiposDocumentoService {
  private repository = new TiposDocumentoRepository();

  async listar(query: ListQuery) {
    const [itens, total] = await Promise.all([this.repository.listar(query), this.repository.contar(query)]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const encontrado = await this.repository.porId(id);
    if (!encontrado) throw new AppError("Tipo de documento não encontrado", 404);
    return encontrado;
  }

  async criar(data: CreateData) {
    await this.garantirNomeLivre(data.nome);
    return this.repository.inserir(data);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.listarPorId(id);
    if (data.nome && data.nome.toLowerCase() !== atual.nome.toLowerCase()) {
      await this.garantirNomeLivre(data.nome, id);
    }
    // Documentos entregues seguem a regra de projeto do tipo — trocá-la deixaria os existentes incoerentes
    if (data.porProjeto !== undefined && data.porProjeto !== atual.porProjeto) {
      if ((await this.repository.contarDocumentos(id)) > 0) {
        throw new AppError(
          `"${atual.nome}" já tem documentos entregues — não é possível mudar se ele é por projeto`,
          409,
          undefined,
          "TIPO_DOCUMENTO_EM_USO",
        );
      }
    }
    const alterado = await this.repository.alterar(id, data);
    if (!alterado) throw new AppError("Tipo de documento não encontrado", 404);
    return alterado;
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    const documentos = await this.repository.contarDocumentos(id);
    if (documentos > 0) {
      throw new AppError(
        `"${atual.nome}" já tem ${documentos} documento(s) entregue(s) — desative-o em vez de excluir`,
        409,
        undefined,
        "TIPO_DOCUMENTO_EM_USO",
      );
    }
    const excluido = await this.repository.excluir(id);
    if (!excluido) throw new AppError("Tipo de documento não encontrado", 404);
  }

  private async garantirNomeLivre(nome: string, excetoId?: string) {
    if (await this.repository.porNome(nome, excetoId)) {
      throw new AppError(
        `Já existe um tipo de documento "${nome}"`,
        409,
        undefined,
        "TIPO_DOCUMENTO_DUPLICADO",
      );
    }
  }
}
