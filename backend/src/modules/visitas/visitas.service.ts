import type { z } from "zod";
import { db } from "../../db/index.ts";
import { AppError } from "../../lib/appError.ts";
import { escopoAtual, garantirAssociacao, garantirProjeto, garantirPropriedade } from "../../lib/escopo.ts";
import { downloadFromS3, nomeArquivo, uploadToS3, type ArquivoUpload } from "../../lib/storage/upload.ts";
import VisitasRepository from "./visitas.repository.ts";
import {
  GRUPOS_DIAGNOSTICO_PROPRIEDADE,
  type ListVisitasQuerySchema,
  type CreateVisitaSchema,
  type UpdateVisitaSchema,
  type PutEquipeSchema,
  type PutDiagnosticoSchema,
  type PutItemVerificadoSchema,
} from "./visitas.schema.ts";

type ListQuery = z.infer<typeof ListVisitasQuerySchema>;
type CreateData = z.infer<typeof CreateVisitaSchema>;
type UpdateData = z.infer<typeof UpdateVisitaSchema>;

const ORIGENS_ACOMPANHAMENTO = ["assistencia_tecnica", "diagnostico_propriedade"];

/** Nome seguro para o Content-Disposition (header só aceita ASCII; aspas quebram o valor). */
const nomeParaDownload = (nome: string) => nome.replace(/[^\x20-\x7e]|["\\]/g, "_");

export default class VisitasService {
  private repository = new VisitasRepository();

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

  /** Visita viva e no escopo do usuário — 404 caso contrário (também usada por recomendações). */
  async buscar(id: string) {
    const visita = await this.repository.porId(id, await escopoAtual());
    if (!visita) throw new AppError("Visita não encontrada", 404);
    return visita;
  }

  async listarPorId(id: string) {
    return this.buscar(id);
  }

  async criar({ realizadaEm, ...data }: CreateData) {
    await garantirProjeto(data.projetoId, { escrita: true });
    const propriedadeId = await this.garantirAlvo(data);
    await this.garantirPessoasNoProjeto(data.projetoId, [data.tecnicoId], "tecnico");
    if (data.visitaAnteriorId && propriedadeId) {
      await this.garantirVisitaAnterior(data.visitaAnteriorId, data.projetoId, propriedadeId);
    }
    const situacao = data.situacao ?? "agendada";
    const { id } = await this.repository.inserir({
      ...data,
      situacao,
      // Realizada sem data-hora → vale o momento do registro (o banco exige uma)
      realizadaEm: situacao === "realizada" ? (realizadaEm ? new Date(realizadaEm) : new Date()) : null,
    });
    return this.buscar(id);
  }

  async alterar(id: string, data: UpdateData) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });

    const { projetoId, tipo, associacaoId, propriedadeId, realizadaEm, ...editaveis } = data;
    if (projetoId !== undefined && projetoId !== atual.projetoId) {
      throw new AppError("O projeto da visita não pode ser alterado", 400);
    }
    if (tipo !== undefined && tipo !== atual.tipo) {
      throw new AppError("O tipo da visita não pode ser alterado", 400);
    }
    if (
      (associacaoId !== undefined && associacaoId !== atual.associacaoId) ||
      (propriedadeId !== undefined && propriedadeId !== atual.propriedadeId)
    ) {
      throw new AppError("O local da visita (associação ou propriedade) não pode ser alterado", 400);
    }

    if (editaveis.tecnicoId && editaveis.tecnicoId !== atual.tecnicoId) {
      await this.garantirPessoasNoProjeto(atual.projetoId, [editaveis.tecnicoId], "tecnico");
    }

    if (editaveis.visitaAnteriorId && editaveis.visitaAnteriorId !== atual.visitaAnteriorId) {
      if (atual.tipo !== "acompanhamento" || !atual.propriedadeId) {
        throw new AppError("Só a visita de acompanhamento aponta uma visita anterior", 400);
      }
      await this.garantirVisitaAnterior(editaveis.visitaAnteriorId, atual.projetoId, atual.propriedadeId);
    }

    const latitude = editaveis.latitude !== undefined ? editaveis.latitude : atual.latitude;
    const longitude = editaveis.longitude !== undefined ? editaveis.longitude : atual.longitude;
    if ((latitude === null) !== (longitude === null)) {
      throw new AppError("Informe latitude e longitude juntas", 400);
    }

    // realizadaEm acompanha a situação: obrigatória na realizada, limpa nas demais
    const situacao = editaveis.situacao ?? atual.situacao;
    let novaRealizadaEm: Date | null;
    if (situacao === "realizada") {
      novaRealizadaEm = realizadaEm ? new Date(realizadaEm) : (atual.realizadaEm ?? new Date());
    } else {
      if (realizadaEm) throw new AppError("Só a visita realizada tem data de realização", 400);
      novaRealizadaEm = null;
    }
    const mudouRealizadaEm = novaRealizadaEm?.getTime() !== atual.realizadaEm?.getTime();

    const alterada = await this.repository.alterar(id, {
      ...editaveis,
      realizadaEm: mudouRealizadaEm ? novaRealizadaEm : undefined,
    });
    if (!alterada) throw new AppError("Visita não encontrada", 404);
    return this.buscar(id);
  }

  async excluir(id: string) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    if ((await this.repository.contarDependencias(id)) > 0) {
      throw new AppError(
        "A visita tem recomendações, análises de solo, acompanhamentos ou diagnóstico da associação ligados — cancele-a em vez de excluir",
        409,
        undefined,
        "VISITA_EM_USO",
      );
    }
    const excluida = await this.repository.excluir(id);
    if (!excluida) throw new AppError("Visita não encontrada", 404);
  }

  // ─── Equipe ───────────────────────────────────────────────────────────────

  async listarEquipe(id: string) {
    await this.buscar(id);
    return this.repository.listarEquipe(id);
  }

  /** Substitui o conjunto: mantém quem continua, exclui (soft) quem saiu e insere quem entrou. */
  async definirEquipe(id: string, { userIds }: z.infer<typeof PutEquipeSchema>) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    // O responsável já está na visita (tecnicoId) — não entra de novo como equipe
    const ids = [...new Set(userIds)].filter((u) => u !== atual.tecnicoId);
    await this.garantirPessoasNoProjeto(atual.projetoId, ids, "equipe");

    await db.transaction(async (tx) => {
      const membros = await this.repository.equipeAtual(id, tx);
      const sairam = membros.filter((m) => !ids.includes(m.userId)).map((m) => m.id);
      const entraram = ids.filter((u) => !membros.some((m) => m.userId === u));
      await this.repository.excluirMembros(sairam, tx);
      await this.repository.inserirMembros(id, entraram, tx);
    });
    return this.repository.listarEquipe(id);
  }

  // ─── Anexos ───────────────────────────────────────────────────────────────

  async listarAnexos(id: string) {
    await this.buscar(id);
    return this.repository.listarAnexos(id);
  }

  async enviarAnexo(
    id: string,
    arquivo: ArquivoUpload,
    { legenda, entregaId }: { legenda: string | null; entregaId: string | null },
  ) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    // Foto de item: só de um item já conferido nesta visita
    if (entregaId && !(await this.repository.itemVerificado(id, entregaId))) {
      throw new AppError(
        "Registre a verificação do item nesta visita antes de enviar fotos dele",
        422,
        undefined,
        "ITEM_NAO_VERIFICADO",
      );
    }
    const pasta = `visitas/${id}`;
    const nome = nomeArquivo("anexo", arquivo.originalname);
    // Bucket privado: guardamos a KEY; o arquivo sai pelo GET .../arquivo (proxy)
    await uploadToS3(pasta, nome, arquivo.buffer, arquivo.mimetype);
    return this.repository.inserirAnexo({
      visitaId: id,
      tipo: arquivo.mimetype.startsWith("image/") ? "foto" : "documento",
      arquivoKey: `${pasta}/${nome}`,
      nomeArquivo: arquivo.originalname,
      mimeType: arquivo.mimetype,
      tamanhoBytes: arquivo.buffer.length,
      legenda,
      entregaId,
    });
  }

  async baixarAnexo(id: string, anexoId: string) {
    await this.buscar(id);
    const anexo = await this.buscarAnexo(id, anexoId);
    const obj = await downloadFromS3(anexo.arquivoKey);
    return {
      ...obj,
      contentType: obj.contentType ?? anexo.mimeType,
      nomeArquivo: nomeParaDownload(anexo.nomeArquivo),
    };
  }

  async excluirAnexo(id: string, anexoId: string) {
    const atual = await this.buscar(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    await this.buscarAnexo(id, anexoId);
    const excluido = await this.repository.excluirAnexo(anexoId);
    if (!excluido) throw new AppError("Anexo não encontrado", 404);
  }

  private async buscarAnexo(id: string, anexoId: string) {
    const anexo = await this.repository.anexoPorId(id, anexoId);
    if (!anexo) throw new AppError("Anexo não encontrado", 404);
    return anexo;
  }

  // ─── Itens verificados (acompanhamento na associação) ─────────────────────

  async listarItensVerificados(id: string) {
    await this.visitaDeAcompanhamentoNaAssociacao(id);
    return this.repository.listarItensVerificados(id);
  }

  /** Cria ou atualiza a verificação: a entrega precisa ser da associação e do projeto da visita, já entregue. */
  async verificarItem(
    id: string,
    entregaId: string,
    { observacao }: z.infer<typeof PutItemVerificadoSchema>,
  ) {
    const atual = await this.visitaDeAcompanhamentoNaAssociacao(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const entrega = await this.repository.entregaPorId(entregaId);
    if (!entrega) throw new AppError("Entrega não encontrada", 404);
    if (entrega.associacaoId !== atual.associacaoId || entrega.projetoId !== atual.projetoId) {
      throw new AppError(
        `“${entrega.itemDescricao}” não foi destinado a esta associação neste projeto`,
        422,
        undefined,
        "ENTREGA_INVALIDA",
      );
    }
    if (entrega.situacao !== "entregue") {
      throw new AppError(
        `“${entrega.itemDescricao}” ainda não foi entregue — só o item fornecido é conferido`,
        422,
        undefined,
        "ENTREGA_INVALIDA",
      );
    }

    const existente = await this.repository.itemVerificado(id, entregaId);
    if (existente) await this.repository.alterarItemVerificado(existente.id, observacao);
    else await this.repository.inserirItemVerificado({ visitaId: id, entregaId, observacao });
    const [verificado] = await this.repository.listarItensVerificados(id, entregaId);
    return verificado;
  }

  async desfazerVerificacao(id: string, entregaId: string) {
    const atual = await this.visitaDeAcompanhamentoNaAssociacao(id);
    await garantirProjeto(atual.projetoId, { escrita: true });
    const [verificado] = await this.repository.listarItensVerificados(id, entregaId);
    if (!verificado) throw new AppError("Item não verificado nesta visita", 404);
    if (verificado.fotos > 0) {
      throw new AppError(
        "O item tem fotos nesta visita — exclua as fotos antes de desfazer a verificação",
        409,
        undefined,
        "ITEM_COM_FOTOS",
      );
    }
    await this.repository.excluirItemVerificado(verificado.id);
  }

  private async visitaDeAcompanhamentoNaAssociacao(id: string) {
    const atual = await this.buscar(id);
    if (atual.tipo !== "acompanhamento" || !atual.associacaoId) {
      throw new AppError(
        "Itens verificados só existem no acompanhamento feito na associação",
        422,
        undefined,
        "TIPO_VISITA_INVALIDO",
      );
    }
    return { ...atual, associacaoId: atual.associacaoId };
  }

  // ─── Diagnóstico da propriedade ───────────────────────────────────────────

  async diagnostico(id: string) {
    await this.visitaDeDiagnostico(id);
    return this.montarDiagnostico(id);
  }

  async salvarDiagnostico(id: string, { opcoes, ...campos }: z.infer<typeof PutDiagnosticoSchema>) {
    const atual = await this.visitaDeDiagnostico(id);
    await garantirProjeto(atual.projetoId, { escrita: true });

    const marcadas = await this.repository.opcoesMarcadas(id);
    const catalogo = await this.repository.opcoesDoCatalogo(opcoes.map((o) => o.opcaoId));
    const novas = opcoes.map((o) => {
      const opcao = catalogo.find((c) => c.id === o.opcaoId);
      // Opção que já estava marcada continua aceita mesmo se foi desativada depois
      const jaMarcada = marcadas.some((m) => m.opcaoId === o.opcaoId);
      if (!opcao || (!opcao.ativo && !jaMarcada)) {
        throw new AppError("Opção de diagnóstico inexistente ou inativa", 422, undefined, "OPCAO_INVALIDA");
      }
      if (!(GRUPOS_DIAGNOSTICO_PROPRIEDADE as readonly string[]).includes(opcao.grupo)) {
        throw new AppError(
          `A opção "${opcao.nome}" não se aplica ao diagnóstico da propriedade`,
          422,
          undefined,
          "OPCAO_INVALIDA",
        );
      }
      const detalhe = o.detalhe || null;
      if (detalhe && !opcao.permiteDetalhe) {
        throw new AppError(`A opção "${opcao.nome}" não aceita detalhe`, 422, undefined, "OPCAO_INVALIDA");
      }
      return { opcaoId: o.opcaoId, detalhe };
    });

    // PUT substitui: campo ausente fica vazio
    const valores = {
      areaProdutivaHa: campos.areaProdutivaHa ?? null,
      areaPastagemHa: campos.areaPastagemHa ?? null,
      areaPreservadaHa: campos.areaPreservadaHa ?? null,
      principaisCulturas: campos.principaisCulturas ?? null,
      rebanhoBovino: campos.rebanhoBovino ?? null,
      fonteAgua: campos.fonteAgua ?? null,
      possuiEnergia: campos.possuiEnergia ?? null,
      possuiIrrigacao: campos.possuiIrrigacao ?? null,
      pessoasTrabalham: campos.pessoasTrabalham ?? null,
      analiseSoloRecente: campos.analiseSoloRecente ?? null,
      acessoMaquinario: campos.acessoMaquinario ?? null,
      comentarios: campos.comentarios ?? null,
    };

    await db.transaction(async (tx) => {
      // PK = visita: diagnóstico excluído é reativado, não recriado
      const existente = await this.repository.diagnosticoPorVisita(id, { incluirExcluido: true }, tx);
      if (existente) await this.repository.alterarDiagnostico(id, { ...valores, deletedAt: null }, tx);
      else await this.repository.inserirDiagnostico({ visitaId: id, ...valores }, tx);

      const atuais = await this.repository.opcoesMarcadas(id, tx);
      const sairam = atuais.filter((a) => !novas.some((n) => n.opcaoId === a.opcaoId)).map((a) => a.id);
      await this.repository.excluirOpcoesMarcadas(sairam, tx);
      for (const n of novas) {
        const igual = atuais.find((a) => a.opcaoId === n.opcaoId);
        if (igual && igual.detalhe !== n.detalhe) {
          await this.repository.alterarDetalheOpcao(igual.id, n.detalhe, tx);
        }
      }
      await this.repository.inserirOpcoesMarcadas(
        id,
        novas.filter((n) => !atuais.some((a) => a.opcaoId === n.opcaoId)),
        tx,
      );
    });
    return this.montarDiagnostico(id);
  }

  private async visitaDeDiagnostico(id: string) {
    const atual = await this.buscar(id);
    if (atual.tipo !== "diagnostico_propriedade") {
      throw new AppError(
        "O diagnóstico da propriedade só existe em visitas do tipo diagnóstico",
        422,
        undefined,
        "TIPO_VISITA_INVALIDO",
      );
    }
    return atual;
  }

  private async montarDiagnostico(id: string) {
    const diagnostico = await this.repository.diagnosticoPorVisita(id);
    if (!diagnostico) throw new AppError("Diagnóstico ainda não preenchido", 404);
    const { deletedAt: _deletedAt, ...campos } = diagnostico;
    const opcoes = await this.repository.opcoesMarcadas(id);
    return {
      ...campos,
      opcoes: opcoes.map(({ opcaoId, grupo, nome, detalhe }) => ({ opcaoId, grupo, nome, detalhe })),
    };
  }

  // ─── Regras compartilhadas ────────────────────────────────────────────────

  /**
   * Alvo conforme o tipo (o zod já garantiu qual dos dois veio): a associação —
   * ou a que atende a propriedade — precisa de adesão ATIVA ao projeto da visita.
   * Devolve o `propriedadeId` (null na visita na associação: inicial ou acompanhamento).
   */
  private async garantirAlvo(
    data: Pick<CreateData, "projetoId" | "tipo" | "associacaoId" | "propriedadeId">,
  ) {
    const naAssociacao =
      data.tipo === "inicial_associacao" || (data.tipo === "acompanhamento" && !!data.associacaoId);
    if (naAssociacao) {
      if (!data.associacaoId) throw new AppError("Informe a associação da visita", 400);
      const associacao = await garantirAssociacao(data.associacaoId);
      if (!(await this.repository.adesaoAtiva(data.projetoId, associacao.id))) {
        throw new AppError("A associação não participa deste projeto", 422, undefined, "SEM_ADESAO");
      }
      return null;
    }
    if (!data.propriedadeId) throw new AppError("Informe a propriedade da visita", 400);
    const propriedade = await garantirPropriedade(data.propriedadeId);
    if (!(await this.repository.adesaoAtiva(data.projetoId, propriedade.associacaoId))) {
      throw new AppError(
        "A associação que atende esta propriedade não participa deste projeto",
        422,
        undefined,
        "SEM_ADESAO",
      );
    }
    return propriedade.id;
  }

  /** Cada pessoa precisa estar na equipe do projeto ou ter papel que vê todos os projetos. */
  private async garantirPessoasNoProjeto(
    projetoId: string,
    userIds: string[],
    papelNaVisita: "tecnico" | "equipe",
  ) {
    const pessoas = await this.repository.pessoasNoProjeto(projetoId, userIds);
    for (const userId of userIds) {
      const pessoa = pessoas.find((p) => p.id === userId);
      if (!pessoa) {
        throw new AppError(
          papelNaVisita === "tecnico" ? "Técnico não encontrado" : "Pessoa não encontrada",
          404,
        );
      }
      if (!pessoa.permitido) {
        throw new AppError(
          papelNaVisita === "tecnico"
            ? "O técnico não faz parte da equipe deste projeto"
            : `${pessoa.nome} não faz parte da equipe deste projeto`,
          422,
          undefined,
          "FORA_DA_EQUIPE",
        );
      }
    }
  }

  /** Acompanhamento → assistência ou diagnóstico da MESMA propriedade e do MESMO projeto. */
  private async garantirVisitaAnterior(anteriorId: string, projetoId: string, propriedadeId: string) {
    const anterior = await this.repository.porId(anteriorId, await escopoAtual());
    if (!anterior) throw new AppError("Visita anterior não encontrada", 404);
    if (
      anterior.projetoId !== projetoId ||
      anterior.propriedadeId !== propriedadeId ||
      !ORIGENS_ACOMPANHAMENTO.includes(anterior.tipo)
    ) {
      throw new AppError(
        "A visita anterior precisa ser uma assistência técnica ou um diagnóstico na mesma propriedade e no mesmo projeto",
        422,
        undefined,
        "VISITA_ANTERIOR_INVALIDA",
      );
    }
  }
}
