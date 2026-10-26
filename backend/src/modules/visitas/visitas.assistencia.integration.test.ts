import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { opcaoDiagnostico } from "../../db/opcaoDiagnostico.ts";
import { visitaAnexo } from "../../db/visitaAnexo.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { ORIGIN, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Assistência técnica (reunião de 23/10): propriedade → atividades do último
 * diagnóstico (com subdivisões do catálogo) → atividades verificadas com
 * observação e fotos. Cobre o CRUD das subdivisões, a lista de conferência,
 * as regras da verificação (404/422/409) e os bloqueios de exclusão.
 * Os `it` são encadeados. A foto é gravada direto no banco (sem Garage).
 */
type Subdivisao = { id: string; opcaoId: string; nome: string; ordem: number; ativo: boolean };
type Verificada = {
  id: string;
  visitaId: string;
  opcaoId: string;
  atividade: string;
  subdivisaoId: string | null;
  subdivisao: string | null;
  observacao: string | null;
  fotos: number;
};
type Atividades = {
  diagnostico: { visitaId: string; data: string } | null;
  linhas: {
    opcaoId: string;
    atividade: string;
    detalhe: string | null;
    subdivisaoId: string | null;
    subdivisao: string | null;
    verificacao: Verificada | null;
  }[];
};

const sufixo = randomUUID().slice(0, 8);

let admin: string;
let adminId: string;
let projetoId: string;
let propriedadeId: string;
let leite: string;
let fruta: string;
let cafe: string;
let problemaSolo: string;
let ordenha: string;
let pastagem: string;
let pomar: string;
let assistencia: string;
let diagnostico: string;
let verificacaoId: string;

const post = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "POST", json: corpo }));
const put = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "PUT", json: corpo }));
const patch = (path: string, corpo: unknown) =>
  app.request(path, comCookie(admin, { method: "PATCH", json: corpo }));
const del = (path: string) => app.request(path, comCookie(admin, { method: "DELETE" }));
const get = (path: string) => app.request(path, comCookie(admin));

const novaVisita = async (corpo: Record<string, unknown>) =>
  (
    await json<{ id: string }>(
      await post("/visitas", { projetoId, propriedadeId, tecnicoId: adminId, data: "2026-06-01", ...corpo }),
    )
  ).data.id;

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  [{ id: adminId }] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, "fslab.vilhena@ifro.edu.br"));

  projetoId = (
    await json<{ id: string }>(
      await post("/projetos", {
        sigla: `${PREFIXO_TESTE}AT-${sufixo}`,
        nome: "Projeto assistência",
        inicio: "2026-01-01",
        fim: "2027-12-31",
      }),
    )
  ).data.id;
  const [{ id: associacaoId }] = await db
    .insert(associacao)
    .values({ sigla: `${PREFIXO_TESTE}ACRUB-${sufixo}`, municipioId: 1100205 })
    .returning({ id: associacao.id });
  await post(`/projetos/${projetoId}/associacoes`, { associacaoId });

  const [{ id: produtorUserId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}João`,
      email: `${PREFIXO_TESTE}joao-at-${sufixo}@example.com`,
      role: "produtor",
    })
    .returning({ id: user.id });
  const [{ id: produtorId }] = await db
    .insert(produtor)
    .values({ userId: produtorUserId })
    .returning({ id: produtor.id });
  [{ id: propriedadeId }] = await db
    .insert(propriedade)
    .values({ produtorId, associacaoId, nome: "Sítio do João", municipioId: 1100205 })
    .returning({ id: propriedade.id });

  [{ id: leite }, { id: fruta }, { id: cafe }, { id: problemaSolo }] = await db
    .insert(opcaoDiagnostico)
    .values([
      { grupo: "atividade_produtiva", nome: "Pecuária leiteira", ordem: 1 },
      { grupo: "atividade_produtiva", nome: "Fruticultura", ordem: 2 },
      { grupo: "atividade_produtiva", nome: "Café", ordem: 3 },
      { grupo: "problema_solo", nome: "Compactação", ordem: 1 },
    ])
    .returning({ id: opcaoDiagnostico.id });
});

describe("subdivisões no catálogo", () => {
  it("POST cria (201); nome repetido sem caixa → 409; fora de atividade produtiva → 422", async () => {
    const res = await post(`/opcoes-diagnostico/${leite}/subdivisoes`, { nome: "  Ordenha ", ordem: 1 });
    expect(res.status).toBe(201);
    expect((await json<Subdivisao>(res)).data).toEqual({
      id: expect.any(String),
      opcaoId: leite,
      nome: "Ordenha",
      ordem: 1,
      ativo: true,
    });

    const repetida = await post(`/opcoes-diagnostico/${leite}/subdivisoes`, { nome: "ORDENHA" });
    expect(repetida.status).toBe(409);
    expect((await json(repetida)).meta).toEqual({ codigo: "SUBDIVISAO_DUPLICADA" });

    const naoAtividade = await post(`/opcoes-diagnostico/${problemaSolo}/subdivisoes`, { nome: "X" });
    expect(naoAtividade.status).toBe(422);
    expect((await json(naoAtividade)).meta).toEqual({ codigo: "OPCAO_SEM_SUBDIVISAO" });
  });

  it("GET lista na ordem (ativas e inativas); PATCH desativa", async () => {
    await post(`/opcoes-diagnostico/${leite}/subdivisoes`, { nome: "Pastagem", ordem: 2 });
    await post(`/opcoes-diagnostico/${fruta}/subdivisoes`, { nome: "Pomar" });
    const lista = await json<Subdivisao[]>(await get(`/opcoes-diagnostico/${leite}/subdivisoes`));
    expect(lista.data.map((s) => s.nome)).toEqual(["Ordenha", "Pastagem"]);
    [ordenha, pastagem] = lista.data.map((s) => s.id);

    [{ id: pomar }] = (await json<Subdivisao[]>(await get(`/opcoes-diagnostico/${fruta}/subdivisoes`))).data;
    const inativa = await patch(`/opcoes-diagnostico/${fruta}/subdivisoes/${pomar}`, { ativo: false });
    expect((await json<Subdivisao>(inativa)).data.ativo).toBe(false);
  });

  it("a listagem de opções conta as subdivisões de cada atividade", async () => {
    const lista = await json<{ id: string; subdivisoes: number }[]>(
      await get("/opcoes-diagnostico?grupo=atividade_produtiva&limit=100"),
    );
    const contagem = (id: string) => lista.data.find((o) => o.id === id)?.subdivisoes;
    expect([contagem(leite), contagem(fruta), contagem(cafe)]).toEqual([2, 1, 0]);
  });

  it("opção com subdivisões não é excluída nem muda de grupo → 409", async () => {
    const excluir = await del(`/opcoes-diagnostico/${leite}`);
    expect(excluir.status).toBe(409);
    expect((await json(excluir)).meta).toEqual({ codigo: "OPCAO_COM_SUBDIVISOES" });
    const grupo = await patch(`/opcoes-diagnostico/${leite}`, { grupo: "problema_solo" });
    expect(grupo.status).toBe(409);
  });
});

describe("lista de conferência", () => {
  it("assistência sem diagnóstico na propriedade → diagnostico null e nenhuma linha", async () => {
    assistencia = await novaVisita({ tipo: "assistencia_tecnica" });
    const res = await get(`/visitas/${assistencia}/atividades`);
    expect(res.status).toBe(200);
    expect((await json<Atividades>(res)).data).toEqual({ diagnostico: null, linhas: [] });
  });

  it("outros tipos de visita → 422", async () => {
    const acompanhamento = await novaVisita({ tipo: "acompanhamento" });
    const res = await get(`/visitas/${acompanhamento}/atividades`);
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "TIPO_VISITA_INVALIDO" });
  });

  it("com diagnóstico: uma linha por subdivisão ativa; sem subdivisão (ou só inativas) → a atividade", async () => {
    diagnostico = await novaVisita({ tipo: "diagnostico_propriedade", data: "2026-05-01" });
    const salvo = await put(`/visitas/${diagnostico}/diagnostico`, {
      opcoes: [{ opcaoId: leite }, { opcaoId: fruta }, { opcaoId: cafe }],
    });
    expect(salvo.status).toBe(200);

    const { data } = await json<Atividades>(await get(`/visitas/${assistencia}/atividades`));
    expect(data.diagnostico).toEqual({ visitaId: diagnostico, data: "2026-05-01" });
    expect(data.linhas.map((l) => [l.atividade, l.subdivisao, l.verificacao])).toEqual([
      ["Pecuária leiteira", "Ordenha", null],
      ["Pecuária leiteira", "Pastagem", null],
      ["Fruticultura", null, null],
      ["Café", null, null],
    ]);
  });
});

describe("verificação", () => {
  it("subdivisão de outra atividade → 404; fora da lista → 422", async () => {
    const outra = await put(`/visitas/${assistencia}/atividades-verificadas`, {
      opcaoId: fruta,
      subdivisaoId: ordenha,
    });
    expect(outra.status).toBe(404);

    // Atividade com subdivisões só é conferida por subdivisão
    for (const corpo of [
      { opcaoId: leite },
      { opcaoId: problemaSolo },
      { opcaoId: fruta, subdivisaoId: pomar },
    ]) {
      const res = await put(`/visitas/${assistencia}/atividades-verificadas`, corpo);
      expect(res.status).toBe(422);
      expect((await json(res)).meta).toEqual({ codigo: "ATIVIDADE_FORA_DO_DIAGNOSTICO" });
    }
  });

  it("PUT da subdivisão → 200; repetir atualiza; aparece na lista de conferência", async () => {
    const res = await put(`/visitas/${assistencia}/atividades-verificadas`, {
      opcaoId: leite,
      subdivisaoId: ordenha,
      observacao: " Ordenha manual, higiene ok ",
    });
    expect(res.status).toBe(200);
    const corpo = await json<Verificada>(res);
    verificacaoId = corpo.data.id;
    expect(corpo.data).toEqual({
      id: expect.any(String),
      visitaId: assistencia,
      opcaoId: leite,
      atividade: "Pecuária leiteira",
      subdivisaoId: ordenha,
      subdivisao: "Ordenha",
      observacao: "Ordenha manual, higiene ok",
      fotos: 0,
    });

    const deNovo = await put(`/visitas/${assistencia}/atividades-verificadas`, {
      opcaoId: leite,
      subdivisaoId: ordenha,
      observacao: "Ordenha mecânica",
    });
    expect((await json<Verificada>(deNovo)).data).toMatchObject({
      id: verificacaoId,
      observacao: "Ordenha mecânica",
    });

    const cafeRes = await put(`/visitas/${assistencia}/atividades-verificadas`, { opcaoId: cafe });
    expect(cafeRes.status).toBe(200);

    const { data } = await json<Atividades>(await get(`/visitas/${assistencia}/atividades`));
    expect(data.linhas.filter((l) => l.verificacao).map((l) => l.subdivisao ?? l.atividade)).toEqual([
      "Ordenha",
      "Café",
    ]);
    expect(data.linhas.find((l) => l.subdivisaoId === pastagem)?.verificacao).toBeNull();
  });

  it("foto de atividade não verificada nesta visita → 422 antes do storage", async () => {
    const form = new FormData();
    form.append("arquivo", new File(["%PDF-1.4"], "laudo.pdf", { type: "application/pdf" }));
    form.append("atividadeVerificadaId", randomUUID());
    const res = await app.request(`/visitas/${assistencia}/anexos`, {
      method: "POST",
      body: form,
      headers: { Cookie: admin, Origin: ORIGIN },
    });
    expect(res.status).toBe(422);
    expect((await json(res)).meta).toEqual({ codigo: "ATIVIDADE_NAO_VERIFICADA" });
  });

  it("com foto: conta na verificação; desfazer → 409; subdivisão e visita não são excluídas (409)", async () => {
    await db.insert(visitaAnexo).values({
      visitaId: assistencia,
      atividadeVerificadaId: verificacaoId,
      tipo: "foto",
      arquivoKey: `visitas/${assistencia}/ordenha.jpg`,
      nomeArquivo: "ordenha.jpg",
      mimeType: "image/jpeg",
      tamanhoBytes: 10,
    });
    const { data } = await json<Atividades>(await get(`/visitas/${assistencia}/atividades`));
    expect(data.linhas[0].verificacao?.fotos).toBe(1);

    const desfazer = await del(`/visitas/${assistencia}/atividades-verificadas/${verificacaoId}`);
    expect(desfazer.status).toBe(409);
    expect((await json(desfazer)).meta).toEqual({ codigo: "ATIVIDADE_COM_FOTOS" });

    const subdivisao = await del(`/opcoes-diagnostico/${leite}/subdivisoes/${ordenha}`);
    expect(subdivisao.status).toBe(409);
    expect((await json(subdivisao)).meta).toEqual({ codigo: "SUBDIVISAO_EM_USO" });

    const visita = await del(`/visitas/${assistencia}`);
    expect(visita.status).toBe(409);
  });

  it("subdivisão desativada depois de verificada continua na lista da visita", async () => {
    await patch(`/opcoes-diagnostico/${leite}/subdivisoes/${ordenha}`, { ativo: false });
    const { data } = await json<Atividades>(await get(`/visitas/${assistencia}/atividades`));
    expect(data.linhas.find((l) => l.verificacao?.id === verificacaoId)).toMatchObject({
      atividade: "Pecuária leiteira",
      subdivisao: "Ordenha",
    });
    await patch(`/opcoes-diagnostico/${leite}/subdivisoes/${ordenha}`, { ativo: true });
  });

  it("sem fotos, desfazer → 204; de novo → 404; subdivisão sem uso pode ser excluída (204)", async () => {
    const [{ id: anexoId }] = await db
      .select({ id: visitaAnexo.id })
      .from(visitaAnexo)
      .where(eq(visitaAnexo.visitaId, assistencia));
    expect((await del(`/visitas/${assistencia}/anexos/${anexoId}`)).status).toBe(204);
    expect((await del(`/visitas/${assistencia}/atividades-verificadas/${verificacaoId}`)).status).toBe(204);
    expect((await del(`/visitas/${assistencia}/atividades-verificadas/${verificacaoId}`)).status).toBe(404);
    expect((await del(`/opcoes-diagnostico/${leite}/subdivisoes/${pastagem}`)).status).toBe(204);
  });

  it("trigger registrou criação, alteração e exclusão da verificação com o admin", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(
        and(
          eq(historicoAlteracao.tabela, "visita_atividades_verificadas"),
          eq(historicoAlteracao.registroId, verificacaoId),
        ),
      )
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(expect.arrayContaining(["INSERT", "UPDATE", "DELETE"]));
    expect(linhas.every((l) => l.alteradoPor === adminId)).toBe(true);
  });
});
