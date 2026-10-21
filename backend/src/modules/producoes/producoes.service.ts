import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirProjeto, noEscopo } from "../../lib/escopo.ts";
import { downloadFromS3, nomeArquivo, uploadToS3, type ArquivoUpload } from "../../lib/storage/upload.ts";
import type { DbOrTx } from "../../db/index.ts";
import ProducoesRepository from "./producoes.repository.ts";
import type {
  ListProducoesQuerySchema,
  CreateProducaoSchema,
  UpdateProducaoSchema,
} from "./producoes.schema.ts";

type ListQuery = z.infer<typeof ListProducoesQuerySchema>;
type CreateData = z.infer<typeof CreateProducaoSchema>;
type UpdateData = z.infer<typeof UpdateProducaoSchema>;

// Extensão pelo tipo já validado (lerDocumento), não pelo nome enviado pelo cliente
const EXTENSOES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export default class ProducoesService {
  private repository = new ProducoesRepository();

  async listar({ projetoId, ...query }: ListQuery) {
    if (projetoId) await garantirProjeto(projetoId);
    const escopo = await escopoAtual();
    const filtros = { ...query, projetoId, escopo };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    return this.buscar(id);
  }

  async criar({ projetoId, projetoEquipeIds = [], ...data }: CreateData) {
    await garantirProjeto(projetoId, { escrita: true });
    if (data.metaId) await this.garantirMeta(projetoId, data.metaId);
    await this.garantirAutores(projetoId, projetoEquipeIds);

    const id = await db.transaction(async (tx) => {
      const { id } = await this.repository.inserir({ projetoId, ...data }, tx);
      await this.repository.inserirAutores(id, projetoEquipeIds, tx);
      return id;
    });
    return this.buscar(id);
  }

  async alterar(id: string, { projetoEquipeIds, ...data }: UpdateData) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if (data.metaId && data.metaId !== atual.metaId) await this.garantirMeta(atual.projetoId, data.metaId);
    if (projetoEquipeIds) await this.garantirAutores(atual.projetoId, projetoEquipeIds);

    await db.transaction(async (tx) => {
      const alterada = await this.repository.alterar(id, data, tx);
      if (!alterada) throw new AppError("Produção não encontrada", 404);
      if (projetoEquipeIds) await this.substituirAutores(id, projetoEquipeIds, tx);
    });
    return this.buscar(id);
  }

  async excluir(id: string) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Produção não encontrada", 404);
  }

  // ─── Arquivo ──────────────────────────────────────────────────────────────

  /** Envia o arquivo (privado) e guarda a KEY — substitui o anterior. */
  async enviarArquivo(id: string, arquivo: ArquivoUpload) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const pasta = `producoes/${id}`;
    const nome = nomeArquivo("producao", `arquivo.${EXTENSOES[arquivo.mimetype] ?? "bin"}`);
    await uploadToS3(pasta, nome, arquivo.buffer, arquivo.mimetype);
    const alterada = await this.repository.definirArquivo(id, `${pasta}/${nome}`);
    if (!alterada) throw new AppError("Produção não encontrada", 404);
    return this.buscar(id);
  }

  /** Objeto do storage para o controller repassar em streaming (proxy autenticado). */
  async baixarArquivo(id: string) {
    await this.buscar(id);
    const key = await this.repository.arquivoKey(id);
    if (!key) throw new AppError("A produção não tem arquivo", 404);
    const obj = await downloadFromS3(key);
    return { ...obj, nome: key.split("/").pop() ?? "arquivo" };
  }

  /** Desvincula o arquivo da produção (204; sem arquivo → 404). */
  async removerArquivo(id: string) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if (!atual.temArquivo) throw new AppError("A produção não tem arquivo", 404);
    const alterada = await this.repository.definirArquivo(id, null);
    if (!alterada) throw new AppError("Produção não encontrada", 404);
  }

  // ─── Auxiliares ───────────────────────────────────────────────────────────

  /** Produção existe, não foi excluída e é de um projeto do escopo — 404 caso contrário. */
  private async buscar(id: string) {
    const [escopo, producao] = await Promise.all([escopoAtual(), this.repository.porId(id)]);
    if (!producao || !noEscopo(escopo, producao.projetoId)) {
      throw new AppError("Produção não encontrada", 404);
    }
    return producao;
  }

  private async garantirMeta(projetoId: string, metaId: string) {
    if (!(await this.repository.metaDoProjeto(projetoId, metaId))) {
      throw new AppError("A meta informada não é deste projeto", 422, undefined, "META_INVALIDA");
    }
  }

  /** Todo autor é membro (não excluído) da equipe do MESMO projeto — 422 caso contrário. */
  private async garantirAutores(projetoId: string, ids: string[]) {
    const membros = new Set(await this.repository.membrosDoProjeto(projetoId, ids));
    if (ids.some((id) => !membros.has(id))) {
      throw new AppError(
        "Os autores precisam ser membros da equipe deste projeto",
        422,
        undefined,
        "AUTOR_FORA_DA_EQUIPE",
      );
    }
  }

  /** Quem saiu é excluído (soft delete), quem entrou é inserido, quem ficou não muda. */
  private async substituirAutores(producaoId: string, ids: string[], tx: DbOrTx) {
    const atuais = await this.repository.autoresAtuais(producaoId, tx);
    const desejados = new Set(ids);
    const existentes = new Set(atuais.map((a) => a.projetoEquipeId));
    await this.repository.excluirAutores(
      atuais.filter((a) => !desejados.has(a.projetoEquipeId)).map((a) => a.id),
      tx,
    );
    await this.repository.inserirAutores(
      producaoId,
      ids.filter((id) => !existentes.has(id)),
      tx,
    );
  }
}
