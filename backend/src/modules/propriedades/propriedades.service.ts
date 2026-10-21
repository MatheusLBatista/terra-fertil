import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirAssociacao, garantirPropriedade } from "../../lib/escopo.ts";
import ProdutoresRepository from "../produtores/produtores.repository.ts";
import { visibilidadeAtual } from "../produtores/produtores.service.ts";
import PropriedadesRepository from "./propriedades.repository.ts";
import {
  areasValidas,
  coordenadasValidas,
  MENSAGEM_AREAS,
  MENSAGEM_COORDENADAS,
  type ListPropriedadesQuerySchema,
  type CreatePropriedadeSchema,
  type UpdatePropriedadeSchema,
} from "./propriedades.schema.ts";

type ListQuery = z.infer<typeof ListPropriedadesQuerySchema>;
type CreateData = z.infer<typeof CreatePropriedadeSchema>;
type UpdateData = z.infer<typeof UpdatePropriedadeSchema>;

export default class PropriedadesService {
  private repository = new PropriedadesRepository();
  private produtores = new ProdutoresRepository();

  async listar(query: ListQuery) {
    // Filtros que apontam para fora do escopo → 404 (não revela que existem)
    if (query.associacaoId) await garantirAssociacao(query.associacaoId);
    if (query.produtorId) await this.garantirProdutor(query.produtorId);
    const filtros = { ...query, escopo: await escopoAtual() };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    await garantirPropriedade(id);
    return this.buscar(id);
  }

  async criar({ municipioId, ...data }: CreateData) {
    const associacao = await garantirAssociacao(data.associacaoId);
    await this.garantirProdutor(data.produtorId);
    // Sem município informado, vale o da associação que atende a propriedade
    const municipio = municipioId ?? associacao.municipioId;
    if (municipioId !== undefined) await this.garantirMunicipio(municipioId);
    const { id } = await this.repository.inserir({ ...data, municipioId: municipio });
    return this.buscar(id);
  }

  async alterar(id: string, data: UpdateData) {
    await garantirPropriedade(id);
    const atual = await this.buscar(id);

    if (data.associacaoId && data.associacaoId !== atual.associacaoId) {
      await garantirAssociacao(data.associacaoId);
    }
    if (data.produtorId && data.produtorId !== atual.produtorId) {
      await this.garantirProdutor(data.produtorId);
    }
    if (data.municipioId !== undefined && data.municipioId !== atual.municipioId) {
      await this.garantirMunicipio(data.municipioId);
    }

    // Regras que cruzam campos: confere o resultado final (o que veio + o que já estava)
    const valor = <K extends keyof typeof atual & keyof UpdateData>(k: K) =>
      data[k] !== undefined ? data[k] : atual[k];
    if (!areasValidas({ areaTotalHa: valor("areaTotalHa"), areaProdutivaHa: valor("areaProdutivaHa") })) {
      throw new AppError(`areaProdutivaHa: ${MENSAGEM_AREAS}`, 400);
    }
    if (!coordenadasValidas({ latitude: valor("latitude"), longitude: valor("longitude") })) {
      throw new AppError(`latitude: ${MENSAGEM_COORDENADAS}`, 400);
    }

    const alterada = await this.repository.alterar(id, data);
    // Excluída entre a leitura e o UPDATE (corrida)
    if (!alterada) throw new AppError("Propriedade não encontrada", 404);
    return this.buscar(id);
  }

  async excluir(id: string) {
    await garantirPropriedade(id);
    const dependencias = await this.repository.contarDependencias(id);
    if (dependencias > 0) {
      throw new AppError(
        "A propriedade já tem visitas ou análises de solo — marque-a como inativa em vez de excluir",
        409,
        undefined,
        "PROPRIEDADE_EM_USO",
      );
    }
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Propriedade não encontrada", 404);
  }

  private async buscar(id: string) {
    const encontrada = await this.repository.porId(id);
    if (!encontrada) throw new AppError("Propriedade não encontrada", 404);
    return encontrada;
  }

  /** Produtor vivo e visível — mesmo critério de GET /produtores/:id. */
  private async garantirProdutor(produtorId: string) {
    if (!(await this.produtores.porId(produtorId, await visibilidadeAtual()))) {
      throw new AppError("Produtor não encontrado", 404);
    }
  }

  private async garantirMunicipio(municipioId: number) {
    if (!(await this.repository.municipioExiste(municipioId))) {
      throw new AppError("Município não encontrado", 404);
    }
  }
}
