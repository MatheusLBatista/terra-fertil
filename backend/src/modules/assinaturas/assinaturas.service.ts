import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { AppError } from "../../lib/appError.ts";
import { downloadFromS3, uploadToS3, type ArquivoUpload } from "../../lib/storage/upload.ts";
import AssinaturasRepository, { type AlvoAssinatura } from "./assinaturas.repository.ts";
import type { AssinaturaFormSchema } from "./assinaturas.schema.ts";

/** Assinatura PNG de verdade (o tipo do multipart vem do cliente). */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Operações genéricas da assinatura. Quem chama (visitas, entregas,
 * associações) já garantiu que o alvo existe, está no escopo e aceita a
 * assinatura — aqui só a regra comum: uma viva por alvo, imagem PNG privada.
 */
export default class AssinaturasService {
  private repository = new AssinaturasRepository();

  /** `null` quando o alvo ainda não foi assinado. */
  async doAlvo(alvo: AlvoAssinatura) {
    const row = await this.repository.porAlvo(alvo);
    if (!row) return null;
    const { imagemKey: _imagemKey, ...publica } = row;
    return publica;
  }

  async buscar(alvo: AlvoAssinatura) {
    const encontrada = await this.doAlvo(alvo);
    if (!encontrada) throw new AppError("Ainda não assinado", 404);
    return encontrada;
  }

  async registrar(
    alvo: AlvoAssinatura,
    pasta: string,
    dados: z.infer<typeof AssinaturaFormSchema>,
    imagem: ArquivoUpload,
  ) {
    if (await this.repository.porAlvo(alvo)) {
      throw new AppError(
        "Já existe uma assinatura — remova-a antes de colher outra",
        409,
        undefined,
        "JA_ASSINADO",
      );
    }
    if (!imagem.buffer.subarray(0, PNG.length).equals(PNG)) {
      throw new AppError("A imagem da assinatura precisa ser PNG", 415);
    }
    const nome = `assinatura-${randomUUID()}.png`;
    await uploadToS3(pasta, nome, imagem.buffer, "image/png");
    await this.repository.inserir({ ...alvo, ...dados, imagemKey: `${pasta}/${nome}` });
    return this.buscar(alvo);
  }

  async imagem(alvo: AlvoAssinatura) {
    const row = await this.repository.porAlvo(alvo);
    if (!row) throw new AppError("Ainda não assinado", 404);
    const obj = await downloadFromS3(row.imagemKey);
    return { ...obj, contentType: "image/png" };
  }

  /** O objeto no bucket fica: a key continua no histórico de alterações. */
  async remover(alvo: AlvoAssinatura) {
    const row = await this.repository.porAlvo(alvo);
    if (!row) throw new AppError("Ainda não assinado", 404);
    await this.repository.excluir(row.id);
  }
}
