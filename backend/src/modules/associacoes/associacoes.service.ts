import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirAssociacao, garantirProjeto, noEscopo } from "../../lib/escopo.ts";
import { downloadFromS3, nomeArquivo, uploadToS3, type ArquivoUpload } from "../../lib/storage/upload.ts";
import PessoasService from "../pessoas/pessoas.service.ts";
import AssociacoesRepository from "./associacoes.repository.ts";
import AssinaturasService from "../assinaturas/assinaturas.service.ts";
import type { AssinaturaFormSchema } from "../assinaturas/assinaturas.schema.ts";
import type {
  ListAssociacoesQuerySchema,
  CreateAssociacaoSchema,
  UpdateAssociacaoSchema,
  CreateContatoSchema,
  UpdateContatoSchema,
  CreateDocumentoSchema,
  UpdateDocumentoSchema,
  PutDiagnosticoSchema,
} from "./associacoes.schema.ts";

type ListQuery = z.infer<typeof ListAssociacoesQuerySchema>;

/** Contatos cadastrados na hora nascem com este papel (sem acesso ao painel até o admin decidir). */
const PAPEL_CONTATO = "produtor";

export default class AssociacoesService {
  private repository = new AssociacoesRepository();
  private assinaturas = new AssinaturasService();
  private pessoas = new PessoasService();

  async listar(query: ListQuery) {
    if (query.projetoId) await garantirProjeto(query.projetoId);
    const filtros = { ...query, escopo: await escopoAtual() };
    const [itens, total] = await Promise.all([
      this.repository.listar(filtros),
      this.repository.contar(filtros),
    ]);
    return { itens, total };
  }

  async listarPorId(id: string) {
    await garantirAssociacao(id);
    return this.buscar(id);
  }

  async criar({ projetoId, ...data }: z.infer<typeof CreateAssociacaoSchema>) {
    // Quem não vê todos os projetos só enxerga associação com adesão — sem
    // projeto, ela sumiria da tela logo depois de cadastrada.
    if (!projetoId && (await escopoAtual()) !== undefined) {
      throw new AppError("Informe o projeto ao qual a associação vai aderir", 400);
    }
    if (projetoId) await garantirProjeto(projetoId, { escrita: true });
    await this.validarUnicidade(data.sigla, data.municipioId, data.cnpj);

    const { id } = await db.transaction(async (tx) => {
      const criada = await this.repository.inserir(data, tx);
      if (projetoId) await this.repository.inserirAdesao(projetoId, criada.id, tx);
      return criada;
    });
    return this.buscar(id);
  }

  async alterar(id: string, data: z.infer<typeof UpdateAssociacaoSchema>) {
    await garantirAssociacao(id);
    const atual = await this.buscar(id);
    const sigla = data.sigla ?? atual.sigla;
    const municipioId = data.municipioId ?? atual.municipioId;
    if (sigla.toLowerCase() !== atual.sigla.toLowerCase() || municipioId !== atual.municipioId || data.cnpj) {
      await this.validarUnicidade(sigla, municipioId, data.cnpj, id);
    }
    const alterada = await this.repository.alterar(id, data);
    if (!alterada) throw new AppError("Associação não encontrada", 404);
    return this.buscar(id);
  }

  async excluir(id: string) {
    await garantirAssociacao(id);
    const { propriedades, adesoes } = await this.repository.contarVinculos(id);
    if (propriedades > 0 || adesoes > 0) {
      throw new AppError(
        "A associação tem propriedades ou participa de projetos — marque-a como inativa em vez de excluir",
        409,
        undefined,
        "ASSOCIACAO_EM_USO",
      );
    }
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Associação não encontrada", 404);
  }

  private async buscar(id: string) {
    const associacao = await this.repository.porId(id);
    if (!associacao) throw new AppError("Associação não encontrada", 404);
    return associacao;
  }

  private async validarUnicidade(
    sigla: string,
    municipioId: number,
    cnpj?: string | null,
    ignorarId?: string,
  ) {
    if (!(await this.repository.municipioExiste(municipioId))) {
      throw new AppError("Município não encontrado", 404);
    }
    if (await this.repository.porSiglaNoMunicipio(sigla, municipioId, ignorarId)) {
      throw new AppError(
        `Já existe uma associação "${sigla}" neste município`,
        409,
        undefined,
        "ASSOCIACAO_DUPLICADA",
      );
    }
    if (cnpj) {
      const outra = await this.repository.porCnpj(cnpj, ignorarId);
      if (outra) {
        throw new AppError(`CNPJ já cadastrado para ${outra.sigla}`, 409, undefined, "CNPJ_DUPLICADO");
      }
    }
  }

  // ─── Contatos ─────────────────────────────────────────────────────────────

  async listarContatos(associacaoId: string) {
    await garantirAssociacao(associacaoId);
    return this.repository.listarContatos(associacaoId);
  }

  async incluirContato(
    associacaoId: string,
    { userId, pessoa, ...data }: z.infer<typeof CreateContatoSchema>,
  ) {
    await garantirAssociacao(associacaoId);
    const contatoId = await db.transaction(async (tx) => {
      const p = await this.pessoas.resolver({ userId, pessoa }, PAPEL_CONTATO, tx);
      if (await this.repository.contatoPorUsuario(associacaoId, p.id, tx)) {
        throw new AppError(`${p.nome} já é contato desta associação`, 409, undefined, "CONTATO_DUPLICADO");
      }
      if (data.principal) await this.repository.desmarcarPrincipal(associacaoId, tx);
      const { id } = await this.repository.inserirContato({ associacaoId, userId: p.id, ...data }, tx);
      return id;
    });
    return this.buscarContato(associacaoId, contatoId);
  }

  async alterarContato(associacaoId: string, contatoId: string, data: z.infer<typeof UpdateContatoSchema>) {
    await garantirAssociacao(associacaoId);
    await this.buscarContato(associacaoId, contatoId);
    await db.transaction(async (tx) => {
      if (data.principal) await this.repository.desmarcarPrincipal(associacaoId, tx);
      const alterado = await this.repository.alterarContato(contatoId, data, tx);
      if (!alterado) throw new AppError("Contato não encontrado", 404);
    });
    return this.buscarContato(associacaoId, contatoId);
  }

  async excluirContato(associacaoId: string, contatoId: string) {
    await garantirAssociacao(associacaoId);
    await this.buscarContato(associacaoId, contatoId);
    const excluido = await this.repository.excluirContato(contatoId);
    if (!excluido) throw new AppError("Contato não encontrado", 404);
  }

  private async buscarContato(associacaoId: string, contatoId: string) {
    const contato = await this.repository.contatoPorId(associacaoId, contatoId);
    if (!contato) throw new AppError("Contato não encontrado", 404);
    return contato;
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  async listarDocumentos(associacaoId: string) {
    await garantirAssociacao(associacaoId);
    return this.repository.listarDocumentos(associacaoId, await escopoAtual());
  }

  async incluirDocumento(associacaoId: string, data: z.infer<typeof CreateDocumentoSchema>) {
    await garantirAssociacao(associacaoId);
    const tipo = await this.repository.tipoDocumentoAtivo(data.tipoDocumentoId);
    if (!tipo) throw new AppError("Tipo de documento não encontrado", 404);

    const projetoId = data.projetoId ?? null;
    if (tipo.porProjeto && !projetoId) {
      throw new AppError(
        `"${tipo.nome}" é por projeto — informe o projeto`,
        422,
        undefined,
        "DOCUMENTO_SEM_PROJETO",
      );
    }
    if (!tipo.porProjeto && projetoId) {
      throw new AppError(
        `"${tipo.nome}" vale para a associação em todos os projetos — não informe projeto`,
        422,
        undefined,
        "DOCUMENTO_COM_PROJETO",
      );
    }
    if (projetoId) {
      await garantirProjeto(projetoId, { escrita: true });
      if (!(await this.repository.temAdesao(associacaoId, projetoId))) {
        throw new AppError("A associação não participa deste projeto", 422, undefined, "SEM_ADESAO");
      }
    }
    if (await this.repository.documentoVigente(associacaoId, tipo.id, projetoId)) {
      throw new AppError(
        `Já existe "${tipo.nome}" registrado — substitua o arquivo ou exclua o atual`,
        409,
        undefined,
        "DOCUMENTO_DUPLICADO",
      );
    }
    const { id } = await this.repository.inserirDocumento({ associacaoId, ...data, projetoId });
    return this.buscarDocumento(associacaoId, id);
  }

  async alterarDocumento(
    associacaoId: string,
    documentoId: string,
    data: z.infer<typeof UpdateDocumentoSchema>,
  ) {
    await this.documentoAcessivel(associacaoId, documentoId, { escrita: true });
    const alterado = await this.repository.alterarDocumento(documentoId, data);
    if (!alterado) throw new AppError("Documento não encontrado", 404);
    return this.buscarDocumento(associacaoId, documentoId);
  }

  async excluirDocumento(associacaoId: string, documentoId: string) {
    await this.documentoAcessivel(associacaoId, documentoId, { escrita: true });
    const excluido = await this.repository.excluirDocumento(documentoId);
    if (!excluido) throw new AppError("Documento não encontrado", 404);
  }

  /** Grava o arquivo no Garage (privado) e marca o documento como recebido, se estava pendente. */
  async enviarArquivo(associacaoId: string, documentoId: string, arquivo: ArquivoUpload) {
    const atual = await this.documentoAcessivel(associacaoId, documentoId, { escrita: true });
    if (atual.temAssinatura) {
      throw new AppError(
        "O documento está assinado — remova a assinatura antes de trocar o arquivo",
        409,
        undefined,
        "DOCUMENTO_ASSINADO",
      );
    }
    const nome = nomeArquivo("documento", arquivo.originalname, "pdf");
    const pasta = `associacoes/${associacaoId}/documentos`;
    await uploadToS3(pasta, nome, arquivo.buffer, arquivo.mimetype);
    await this.repository.alterarDocumento(documentoId, {
      arquivoKey: `${pasta}/${nome}`,
      nomeArquivo: arquivo.originalname,
      mimeType: arquivo.mimetype,
      tamanhoBytes: arquivo.buffer.length,
      situacao: atual.situacao === "pendente" ? "recebido" : atual.situacao,
    });
    return this.buscarDocumento(associacaoId, documentoId);
  }

  async baixarArquivo(associacaoId: string, documentoId: string) {
    const doc = await this.documentoAcessivel(associacaoId, documentoId);
    if (!doc.arquivoKey) throw new AppError("Este documento ainda não tem arquivo", 404);
    return { ...(await downloadFromS3(doc.arquivoKey)), nomeArquivo: doc.nomeArquivo ?? undefined };
  }

  // ─── Assinatura do documento (pela associação) ────────────────────────────

  async assinatura(associacaoId: string, documentoId: string) {
    await this.documentoAcessivel(associacaoId, documentoId);
    return this.assinaturas.doAlvo({ associacaoDocumentoId: documentoId });
  }

  async assinar(
    associacaoId: string,
    documentoId: string,
    dados: z.infer<typeof AssinaturaFormSchema>,
    imagem: ArquivoUpload,
  ) {
    const doc = await this.documentoAcessivel(associacaoId, documentoId, { escrita: true });
    if (!doc.arquivoKey) {
      throw new AppError(
        "Envie o arquivo do documento antes de colher a assinatura",
        422,
        undefined,
        "DOCUMENTO_SEM_ARQUIVO",
      );
    }
    if (dados.papel === "proprietario") {
      throw new AppError(
        "O documento é assinado pela associação (presidente, vice ou outro representante)",
        422,
        undefined,
        "PAPEL_INVALIDO",
      );
    }
    return this.assinaturas.registrar(
      { associacaoDocumentoId: documentoId },
      `associacoes/${associacaoId}/documentos/assinaturas`,
      dados,
      imagem,
    );
  }

  async imagemAssinatura(associacaoId: string, documentoId: string) {
    await this.documentoAcessivel(associacaoId, documentoId);
    return this.assinaturas.imagem({ associacaoDocumentoId: documentoId });
  }

  async removerAssinatura(associacaoId: string, documentoId: string) {
    await this.documentoAcessivel(associacaoId, documentoId, { escrita: true });
    await this.assinaturas.remover({ associacaoDocumentoId: documentoId });
  }

  /** Documento visível: associação no escopo e, se for por projeto, projeto no escopo. */
  private async documentoAcessivel(associacaoId: string, documentoId: string, { escrita = false } = {}) {
    await garantirAssociacao(associacaoId);
    const doc = await this.repository.documentoPorId(associacaoId, documentoId);
    if (!doc || (doc.projetoId && !noEscopo(await escopoAtual(), doc.projetoId))) {
      throw new AppError("Documento não encontrado", 404);
    }
    if (doc.projetoId && escrita) await garantirProjeto(doc.projetoId, { escrita: true });
    return doc;
  }

  private async buscarDocumento(associacaoId: string, documentoId: string) {
    const doc = await this.repository.documentoPorId(associacaoId, documentoId);
    if (!doc) throw new AppError("Documento não encontrado", 404);
    return this.repository.documentoPublico(doc);
  }

  // ─── Diagnóstico ──────────────────────────────────────────────────────────

  async diagnostico(associacaoId: string) {
    await garantirAssociacao(associacaoId);
    const diagnostico = await this.repository.diagnostico(associacaoId);
    if (!diagnostico) throw new AppError("Diagnóstico ainda não preenchido", 404);
    return { ...diagnostico, opcoes: await this.repository.opcoesDoDiagnostico(associacaoId) };
  }

  async salvarDiagnostico(associacaoId: string, { opcoes, ...data }: z.infer<typeof PutDiagnosticoSchema>) {
    await garantirAssociacao(associacaoId);

    if (data.visitaId) {
      const visita = await this.repository.visitaInicialDaAssociacao(data.visitaId, associacaoId);
      if (!visita) {
        throw new AppError(
          "A visita informada não é uma visita inicial desta associação",
          422,
          undefined,
          "VISITA_INVALIDA",
        );
      }
      await garantirProjeto(visita.projetoId);
    }

    // Opções: ativas, sem repetição; "detalhe" só nas que pedem texto ("Outro")
    const ids = [...new Set(opcoes.map((o) => o.opcaoId))];
    const ativas = new Map((await this.repository.opcoesAtivas(ids)).map((o) => [o.id, o]));
    const faltando = ids.filter((id) => !ativas.has(id));
    if (faltando.length > 0) {
      throw new AppError(
        "Há opções inexistentes ou inativas no diagnóstico",
        422,
        undefined,
        "OPCAO_INVALIDA",
      );
    }
    const marcadas = ids.map((opcaoId) => {
      const detalhe = opcoes.find((o) => o.opcaoId === opcaoId)?.detalhe?.trim() || null;
      return { opcaoId, detalhe: ativas.get(opcaoId)?.permiteDetalhe ? detalhe : null };
    });

    await db.transaction(async (tx) => {
      await this.repository.salvarDiagnostico({ associacaoId, revisado: false, ...data }, tx);
      await this.repository.substituirOpcoes(associacaoId, marcadas, tx);
    });
    return this.diagnostico(associacaoId);
  }
}
