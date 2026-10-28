import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { user } from "../../db/user.ts";
import { associacao } from "../../db/associacao.ts";
import { produtor } from "../../db/produtor.ts";
import { propriedade } from "../../db/propriedade.ts";
import { item } from "../../db/item.ts";
import { entrega } from "../../db/entrega.ts";
import { visita } from "../../db/visita.ts";
import { recomendacao } from "../../db/recomendacao.ts";
import { tipoDocumento } from "../../db/tipoDocumento.ts";
import { associacaoDocumento } from "../../db/associacaoDocumento.ts";
import { assinatura } from "../../db/assinatura.ts";
import { lancamentoFinanceiro } from "../../db/lancamentoFinanceiro.ts";
import { auth } from "../../lib/auth.ts";
import { seedEstados } from "../../seeds/estados.ts";
import { seedMunicipios } from "../../seeds/municipios.ts";
import { comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Dashboard: os números e pendências da gestão de um projeto (com "hoje" fixo
 * para o mês e os prazos serem determinísticos) e a visão do técnico — só as
 * visitas em que ele é o responsável ou está na equipe. Dados gravados direto
 * no banco: o que se testa aqui é a agregação, não as regras de cada módulo.
 */
type Lista<T> = { total: number; itens: T[] };
type Gestao = {
  indicadores: Record<string, number>;
  funil: { situacoes: { situacao: string; total: number }[]; termoAssinado: number };
  pendencias: {
    documentos: Lista<{ tipoDocumento: string; situacao: string }>;
    entregasSemAssinatura: Lista<{ id: string }>;
    visitasSemAssinatura: Lista<{ id: string; onde: string }>;
    recomendacoesVencidas: Lista<{ id: string }>;
  };
};
type Tecnico = {
  realizadasMes: number;
  proximas: Lista<{ id: string }>;
  atrasadas: Lista<{ id: string }>;
  paraFechar: Lista<{ id: string; faltaRelato: boolean; faltaFoto: boolean; faltaAssinatura: boolean }>;
  recomendacoes: Lista<{ id: string; vencida: boolean }>;
};

const sufixo = randomUUID().slice(0, 8);
const HOJE = "2026-10-15";
const SIGLA = `${PREFIXO_TESTE}DASH-${sufixo}`;
const EMAIL_TECNICO = `${PREFIXO_TESTE}tec-dash-${sufixo}@example.com`;

let admin: string;
let tecnico: string;
let tecnicoId: string;
let outroTecnicoId: string;
let projetoId: string;
let associacaoId: string;
let propriedadeId: string;

// Visitas do técnico
let proxima: string;
let atrasada: string;
let semRelato: string;
let assistenciaSemAssinatura: string;
let vencida: string;
let aVencer: string;
let doOutro: string;

beforeAll(async () => {
  await seedEstados();
  await seedMunicipios();
  admin = await login("fslab.vilhena@ifro.edu.br");
  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: "senha-teste-123",
      name: "Técnico Dash",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, "senha-teste-123");
  [{ id: outroTecnicoId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}Outro técnico`,
      email: `${PREFIXO_TESTE}outro-dash-${sufixo}@example.com`,
      role: "tecnico",
    })
    .returning({ id: user.id });

  const post = (path: string, corpo: unknown) =>
    app.request(path, comCookie(admin, { method: "POST", json: corpo }));
  projetoId = (
    await json<{ id: string }>(
      await post("/projetos", {
        sigla: `${PREFIXO_TESTE}DS-${sufixo}`,
        nome: "Projeto dashboard",
        inicio: "2026-01-01",
        fim: "2027-12-31",
      }),
    )
  ).data.id;
  await post(`/projetos/${projetoId}/equipe`, { userId: tecnicoId, tipo: "tecnico" });

  [{ id: associacaoId }] = await db
    .insert(associacao)
    .values({ sigla: SIGLA, municipioId: 1100205 })
    .returning({ id: associacao.id });
  await post(`/projetos/${projetoId}/associacoes`, { associacaoId });
  const [{ id: produtorUserId }] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: `${PREFIXO_TESTE}João`,
      email: `${PREFIXO_TESTE}joao-dash-${sufixo}@example.com`,
      role: "produtor",
    })
    .returning({ id: user.id });
  const [{ id: produtorId }] = await db
    .insert(produtor)
    .values({ userId: produtorUserId })
    .returning({ id: produtor.id });
  [{ id: propriedadeId }] = await db
    .insert(propriedade)
    .values({ produtorId, associacaoId, nome: "Sítio Painel", municipioId: 1100205 })
    .returning({ id: propriedade.id });

  // Visitas: do técnico (responsável) e uma do outro técnico, que ele não deve ver
  const base = { projetoId, tecnicoId, propriedadeId, relato: "Relato ok" };
  const realizada = (data: string) => ({
    situacao: "realizada" as const,
    data,
    realizadaEm: new Date(`${data}T12:00:00Z`),
  });
  [{ id: proxima }, { id: atrasada }, { id: semRelato }, { id: assistenciaSemAssinatura }] = await db
    .insert(visita)
    .values([
      { ...base, tipo: "assistencia_tecnica", data: "2026-10-20" },
      { ...base, tipo: "assistencia_tecnica", data: "2026-10-01" },
      { ...base, tipo: "diagnostico_propriedade", relato: "  ", ...realizada("2026-10-05") },
      { ...base, tipo: "assistencia_tecnica", ...realizada("2026-09-20") },
    ])
    .returning({ id: visita.id });
  [{ id: doOutro }] = await db
    .insert(visita)
    .values({ ...base, tecnicoId: outroTecnicoId, tipo: "assistencia_tecnica", data: "2026-10-21" })
    .returning({ id: visita.id });
  await db.insert(visita).values([
    // Inicial na associação, realizada no mês: conta em visitasMes e associacoesVisitadas
    {
      projetoId,
      tecnicoId: outroTecnicoId,
      tipo: "inicial_associacao",
      associacaoId,
      relato: "Reunião",
      ...realizada("2026-10-02"),
    },
  ]);

  [{ id: vencida }, { id: aVencer }] = await db
    .insert(recomendacao)
    .values([
      {
        propriedadeId,
        visitaId: assistenciaSemAssinatura,
        categoria: "calagem",
        descricao: "Calagem",
        prazo: "2026-10-10",
      },
      {
        propriedadeId,
        visitaId: assistenciaSemAssinatura,
        categoria: "adubacao",
        descricao: "Adubação",
        prazo: "2026-10-25",
      },
    ])
    .returning({ id: recomendacao.id });
  await db.insert(recomendacao).values({
    propriedadeId,
    visitaId: assistenciaSemAssinatura,
    categoria: "gestao",
    descricao: "Longe",
    prazo: "2026-12-31",
  });

  const [{ id: itemId }] = await db
    .insert(item)
    .values({ descricao: `${PREFIXO_TESTE}Trator ${sufixo}`, tipo: "investimento", categoria: "maquina" })
    .returning({ id: item.id });
  const [{ id: entregueAssinada }] = await db
    .insert(entrega)
    .values([
      { projetoId, associacaoId, itemId, situacao: "entregue", dataEntrega: "2026-09-01" },
      { projetoId, associacaoId, itemId, situacao: "entregue", dataEntrega: "2026-09-02" },
      { projetoId, associacaoId, itemId, situacao: "demandado" },
      { projetoId, associacaoId, itemId, situacao: "cancelado" },
    ])
    .returning({ id: entrega.id });
  await db.insert(assinatura).values({
    entregaId: entregueAssinada,
    nome: "Presidente",
    papel: "presidente",
    imagemKey: "teste/a.png",
  });

  const [{ id: estatuto }, { id: ata }, { id: ok }] = await db
    .insert(tipoDocumento)
    .values([
      { nome: `${PREFIXO_TESTE}Estatuto ${sufixo}` },
      { nome: `${PREFIXO_TESTE}Ata ${sufixo}` },
      { nome: `${PREFIXO_TESTE}CNPJ ${sufixo}` },
    ])
    .returning({ id: tipoDocumento.id });
  await db.insert(associacaoDocumento).values([
    { associacaoId, tipoDocumentoId: estatuto, situacao: "pendente" },
    { associacaoId, tipoDocumentoId: ata, situacao: "validado", validade: "2026-11-01" },
    { associacaoId, tipoDocumentoId: ok, situacao: "validado", validade: "2027-06-01" },
  ]);

  await db.insert(lancamentoFinanceiro).values([
    { projetoId, tipo: "liberacao", valorCentavos: 100_000, data: "2026-02-01", descricao: "Parcela" },
    { projetoId, tipo: "despesa", valorCentavos: 25_000, data: "2026-03-01", descricao: "Compra" },
  ]);
});

describe("gestão", () => {
  it("sem projetoId → 400; técnico também lê (permissão de metas), no escopo dele", async () => {
    expect((await app.request("/dashboard/gestao", comCookie(admin))).status).toBe(400);
    const res = await app.request(
      `/dashboard/gestao?projetoId=${projetoId}&hoje=${HOJE}`,
      comCookie(tecnico),
    );
    expect(res.status).toBe(200);
  });

  it("indicadores, funil e pendências do projeto", async () => {
    const res = await app.request(`/dashboard/gestao?projetoId=${projetoId}&hoje=${HOJE}`, comCookie(admin));
    const { data } = await json<Gestao>(res);
    expect(data.indicadores).toEqual({
      visitasMes: 2,
      visitasMesAnterior: 1,
      entregasEntregues: 2,
      entregasDemandadas: 3,
      associacoesVisitadas: 1,
      associacoes: 1,
      liberadoCentavos: 100_000,
      gastoCentavos: 25_000,
    });
    expect(Object.fromEntries(data.funil.situacoes.map((s) => [s.situacao, s.total]))).toEqual({
      entregue: 2,
      demandado: 1,
      cancelado: 1,
    });
    expect(data.funil.termoAssinado).toBe(1);

    const { documentos, entregasSemAssinatura, visitasSemAssinatura, recomendacoesVencidas } =
      data.pendencias;
    // Pendente + vencendo em 30 dias; o validado com validade longe fica de fora
    expect(documentos.total).toBe(2);
    expect(documentos.itens.map((d) => d.situacao).sort()).toEqual(["pendente", "validado"]);
    expect(entregasSemAssinatura.total).toBe(1);
    expect(visitasSemAssinatura.itens.map((v) => v.id)).toEqual([assistenciaSemAssinatura]);
    expect(visitasSemAssinatura.itens[0].onde).toBe(`${PREFIXO_TESTE}João — Sítio Painel`);
    expect(recomendacoesVencidas.itens.map((r) => r.id)).toEqual([vencida]);
  });
});

describe("técnico", () => {
  it("só as visitas dele: próximas, atrasadas, para fechar e recomendações", async () => {
    const res = await app.request(`/dashboard/tecnico?hoje=${HOJE}`, comCookie(tecnico));
    expect(res.status).toBe(200);
    const { data } = await json<Tecnico>(res);
    expect(data.realizadasMes).toBe(1);
    expect(data.proximas.itens.map((v) => v.id)).toEqual([proxima]);
    expect(data.atrasadas.itens.map((v) => v.id)).toEqual([atrasada]);
    expect(data.paraFechar.itens).toEqual([
      expect.objectContaining({ id: semRelato, faltaRelato: true, faltaFoto: true, faltaAssinatura: false }),
      expect.objectContaining({
        id: assistenciaSemAssinatura,
        faltaRelato: false,
        faltaFoto: true,
        faltaAssinatura: true,
      }),
    ]);
    expect(data.recomendacoes.itens).toEqual([
      expect.objectContaining({ id: vencida, vencida: true }),
      expect.objectContaining({ id: aVencer, vencida: false }),
    ]);
  });

  it("na equipe de uma visita do outro técnico, ela passa a aparecer", async () => {
    await app.request(
      `/visitas/${doOutro}/equipe`,
      comCookie(admin, { method: "PUT", json: { userIds: [tecnicoId] } }),
    );
    const { data } = await json<Tecnico>(
      await app.request(`/dashboard/tecnico?hoje=${HOJE}`, comCookie(tecnico)),
    );
    expect(data.proximas.itens.map((v) => v.id)).toEqual([proxima, doOutro]);
  });
});
