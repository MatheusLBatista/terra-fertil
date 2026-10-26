import { and, eq, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/index.ts";
import { assinatura, type NewAssinatura } from "../../db/assinatura.ts";
import { user } from "../../db/user.ts";

/** O alvo da assinatura: exatamente uma das três FKs. */
export type AlvoAssinatura = { visitaId: string } | { entregaId: string } | { associacaoDocumentoId: string };

const doAlvo = (alvo: AlvoAssinatura) =>
  "visitaId" in alvo
    ? eq(assinatura.visitaId, alvo.visitaId)
    : "entregaId" in alvo
      ? eq(assinatura.entregaId, alvo.entregaId)
      : eq(assinatura.associacaoDocumentoId, alvo.associacaoDocumentoId);

const colunas = {
  id: assinatura.id,
  nome: assinatura.nome,
  papel: assinatura.papel,
  assinadoEm: assinatura.assinadoEm,
  registradoPorNome: user.name,
};

export default class AssinaturasRepository {
  /** Assinatura viva do alvo, com a key da imagem (uso interno — não vai na resposta). */
  async porAlvo(alvo: AlvoAssinatura, tx: DbOrTx = db) {
    const [row] = await tx
      .select({ ...colunas, imagemKey: assinatura.imagemKey })
      .from(assinatura)
      .leftJoin(user, eq(user.id, assinatura.createdBy))
      .where(and(doAlvo(alvo), isNull(assinatura.deletedAt)))
      .limit(1);
    return row;
  }

  async inserir(data: NewAssinatura, tx: DbOrTx = db): Promise<{ id: string }> {
    const [row] = await tx.insert(assinatura).values(data).returning({ id: assinatura.id });
    return row;
  }

  async excluir(id: string, tx: DbOrTx = db): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .update(assinatura)
      .set({ deletedAt: new Date() })
      .where(and(eq(assinatura.id, id), isNull(assinatura.deletedAt)))
      .returning({ id: assinatura.id });
    return row;
  }
}
