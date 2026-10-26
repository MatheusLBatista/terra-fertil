import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirAssociacao, garantirProjeto } from "../../lib/escopo.ts";
import { downloadFromS3, nomeArquivo, uploadToS3, type ArquivoUpload } from "../../lib/storage/upload.ts";
import EntregasRepository from "./entregas.repository.ts";
import {
  MENSAGEM_DATA_SEM_ENTREGUE,
  MENSAGEM_SEM_DATA_ENTREGA,
  type ListEntregasQuerySchema,
  type CreateEntregaSchema,
  type UpdateEntregaSchema,
} from "./entregas.schema.ts";

type ListQuery = z.infer<typeof ListEntregasQuerySchema>;
type CreateData = z.infer<typeof CreateEntregaSchema>;
type UpdateData = z.infer<typeof UpdateEntregaSchema>;

export default class EntregasService {
  private repository = new EntregasRepository();

  async listar(query: ListQuery) {
    if (query.projetoId) await garantirProjeto(query.projetoId);
    const escopo = await escopoAtual();
    const filtros = { ...query, escopo };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    const encontrada = await this.repository.porId(id, await escopoAtual());
    if (!encontrada) throw new AppError("Entrega não encontrada", 404);
    return encontrada;
  }

  async criar(data: CreateData) {
    await garantirProjeto(data.projetoId, { escrita: true });
    await this.garantirAssociacaoNoProjeto(data.projetoId, data.associacaoId);
    await this.garantirItemAtivo(data.itemId);
    if (data.pedidoId) await this.garantirPedidoDoProjeto(data.pedidoId, data.projetoId);
    const { id } = await this.repository.inserir(data);
    return this.listarPorId(id);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });

    if (data.associacaoId && data.associacaoId !== atual.associacaoId) {
      await this.garantirAssociacaoNoProjeto(atual.projetoId, data.associacaoId);
    }
    // Item já vinculado segue valendo mesmo se for inativado depois; só a troca é checada
    if (data.itemId && data.itemId !== atual.itemId) await this.garantirItemAtivo(data.itemId);
    if (data.pedidoId && data.pedidoId !== atual.pedidoId) {
      await this.garantirPedidoDoProjeto(data.pedidoId, atual.projetoId);
    }

    const situacao = data.situacao ?? atual.situacao;
    const dataEntrega = data.dataEntrega !== undefined ? data.dataEntrega : atual.dataEntrega;
    if (situacao === "entregue" && !dataEntrega) throw new AppError(MENSAGEM_SEM_DATA_ENTREGA, 400);
    if (situacao !== "entregue" && dataEntrega) throw new AppError(MENSAGEM_DATA_SEM_ENTREGUE, 400);

    const alterada = await this.repository.alterar(id, data);
    if (!alterada) throw new AppError("Entrega não encontrada", 404);
    return this.listarPorId(id);
  }

  async excluir(id: string) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if ((await this.repository.contarVerificacoes(id)) > 0) {
      throw new AppError(
        "A entrega já foi conferida em visita de acompanhamento — cancele-a em vez de excluir",
        409,
        undefined,
        "ENTREGA_VERIFICADA",
      );
    }
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Entrega não encontrada", 404);
  }

  // ─── Termo de uso (arquivo privado no Garage; no banco só a key) ──────────

  async enviarTermoUso(id: string, arquivo: ArquivoUpload) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const pasta = `entregas/${id}`;
    const nome = nomeArquivo("termo-uso", arquivo.originalname, "pdf");
    await uploadToS3(pasta, nome, arquivo.buffer, arquivo.mimetype);
    // O objeto anterior (se houver) fica no bucket: a key antiga continua no histórico
    const gravada = await this.repository.definirTermoUso(id, `${pasta}/${nome}`);
    if (!gravada) throw new AppError("Entrega não encontrada", 404);
    return this.listarPorId(id);
  }

  async baixarTermoUso(id: string) {
    await this.listarPorId(id);
    const key = await this.repository.chaveTermoUso(id);
    if (!key) throw new AppError("Esta entrega não tem termo de uso", 404);
    const obj = await downloadFromS3(key);
    return { obj, nome: key.split("/").pop() ?? "termo-uso" };
  }

  async removerTermoUso(id: string) {
    const atual = await this.listarPorId(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if (!atual.temTermoUso) throw new AppError("Esta entrega não tem termo de uso", 404);
    const removido = await this.repository.definirTermoUso(id, null);
    if (!removido) throw new AppError("Entrega não encontrada", 404);
  }

  // ─── Regras de vínculo ────────────────────────────────────────────────────

  /** Associação visível (404) com adesão ATIVA ao projeto (422). */
  private async garantirAssociacaoNoProjeto(projetoId: string, associacaoId: string) {
    const associacao = await garantirAssociacao(associacaoId);
    if (!(await this.repository.adesaoAtiva(projetoId, associacaoId))) {
      throw new AppError(
        `${associacao.sigla} não tem adesão ativa a este projeto`,
        422,
        undefined,
        "SEM_ADESAO_ATIVA",
      );
    }
  }

  /** Item do catálogo existente (404) e ativo (422). */
  private async garantirItemAtivo(itemId: string) {
    const encontrado = await this.repository.itemPorId(itemId);
    if (!encontrado) throw new AppError("Item não encontrado", 404);
    if (!encontrado.ativo) {
      throw new AppError(`O item “${encontrado.descricao}” está inativo`, 422, undefined, "ITEM_INATIVO");
    }
  }

  /** Pedido existente (404) e do MESMO projeto da entrega (422). */
  private async garantirPedidoDoProjeto(pedidoId: string, projetoId: string) {
    const pedido = await this.repository.pedidoPorId(pedidoId);
    if (!pedido) throw new AppError("Pedido de compra não encontrado", 404);
    if (pedido.projetoId !== projetoId) {
      throw new AppError(
        `O pedido ${pedido.numero} é de outro projeto`,
        422,
        undefined,
        "PEDIDO_DE_OUTRO_PROJETO",
      );
    }
  }
}
