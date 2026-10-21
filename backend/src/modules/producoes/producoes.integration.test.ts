import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import app from "../../app.ts";
import { db } from "../../db/index.ts";
import { historicoAlteracao } from "../../db/historicoAlteracao.ts";
import { meta } from "../../db/meta.ts";
import { producaoAutor } from "../../db/producaoAutor.ts";
import { auth } from "../../lib/auth.ts";
import { ORIGIN, anonima, comCookie, json, login } from "../../test/http.ts";
import { PREFIXO_TESTE } from "../../test/setup.ts";

/**
 * Produções pela API: CRUD com autores (membros da equipe do MESMO projeto),
 * meta do mesmo projeto, filtros, arquivo (só os caminhos que não tocam o
 * storage — não há Garage no ambiente de teste) e o ESCOPO por projeto.
 * Os `it` são encadeados (leem os ids criados nos passos anteriores).
 */
type Producao = {
  id: string;
  projetoId: string;
  titulo: string;
  metaId: string | null;
  metaNumero: number | null;
  concluidaEm: string | null;
  temArquivo: boolean;
  autores: { projetoEquipeId: string; nome: string }[];
};

const sufixo = randomUUID().slice(0, 8);
const EMAIL_TECNICO = `${PREFIXO_TESTE}tec-producao-${sufixo}@example.com`;
const SENHA_TECNICO = "senha-teste-123";

let admin: string;
let tecnico: string;
let tecnicoId: string;
let projetoA: string;
let projetoB: string;
let membroTecnico: string;
let membroEstudante: string;
let membroB: string;
let metaA: string;
let metaB: string;
let producaoId: string;
let producaoB: string;

async function criarProjeto(sigla: string) {
  const res = await app.request(
    "/projetos",
    comCookie(admin, {
      method: "POST",
      json: { sigla, nome: `Projeto ${sigla}`, inicio: "2026-01-01", fim: "2027-12-31" },
    }),
  );
  return (await json<{ id: string }>(res)).data.id;
}

async function incluirMembro(projetoId: string, corpo: Record<string, unknown>) {
  const res = await app.request(
    `/projetos/${projetoId}/equipe`,
    comCookie(admin, { method: "POST", json: corpo }),
  );
  return (await json<{ id: string }>(res)).data.id;
}

beforeAll(async () => {
  admin = await login("fslab.vilhena@ifro.edu.br");
  const criado = await auth.api.createUser({
    body: {
      email: EMAIL_TECNICO,
      password: SENHA_TECNICO,
      name: "Técnico de Teste",
      role: "tecnico" as "admin",
    },
  });
  tecnicoId = criado.user.id;
  tecnico = await login(EMAIL_TECNICO, SENHA_TECNICO);

  projetoA = await criarProjeto(`${PREFIXO_TESTE}PRA-${sufixo}`);
  projetoB = await criarProjeto(`${PREFIXO_TESTE}PRB-${sufixo}`);
  membroTecnico = await incluirMembro(projetoA, { userId: tecnicoId, tipo: "tecnico" });
  membroEstudante = await incluirMembro(projetoA, {
    pessoa: { nome: `${PREFIXO_TESTE}Estudante-${sufixo}` },
    tipo: "estudante",
  });
  membroB = await incluirMembro(projetoB, {
    pessoa: { nome: `${PREFIXO_TESTE}Bolsista-${sufixo}` },
    tipo: "estudante",
  });

  [{ id: metaA }, { id: metaB }] = await db
    .insert(meta)
    .values([
      { projetoId: projetoA, numero: 7, descricao: "Relatórios técnicos", peso: 10 },
      { projetoId: projetoB, numero: 7, descricao: "Relatórios técnicos", peso: 10 },
    ])
    .returning({ id: meta.id });
});

describe("gates", () => {
  it("GET /producoes sem cookie → 401", async () => {
    const res = await app.request("/producoes", anonima());
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ data: [], meta: {}, erros: ["Não autenticado"] });
  });

  it("POST /producoes com usuario@example.com → 403", async () => {
    const usuario = await login("usuario@example.com");
    const res = await app.request(
      "/producoes",
      comCookie(usuario, {
        method: "POST",
        json: { projetoId: projetoA, titulo: "X", tipo: "relatorio_tecnico" },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("CRUD de produções", () => {
  it("POST cria com meta e autores (201)", async () => {
    const res = await app.request(
      "/producoes",
      comCookie(tecnico, {
        method: "POST",
        json: {
          projetoId: projetoA,
          titulo: `${PREFIXO_TESTE}Relatório de solos`,
          tipo: "relatorio_tecnico_participativo",
          metaId: metaA,
          url: "https://exemplo.org/relatorio",
          projetoEquipeIds: [membroTecnico, membroEstudante],
        },
      }),
    );
    expect(res.status).toBe(201);
    const corpo = await json<Producao>(res);
    expect(corpo).toEqual({
      data: {
        id: expect.any(String),
        projetoId: projetoA,
        titulo: `${PREFIXO_TESTE}Relatório de solos`,
        tipo: "relatorio_tecnico_participativo",
        metaId: metaA,
        metaNumero: 7,
        concluidaEm: null,
        url: "https://exemplo.org/relatorio",
        resumo: null,
        temArquivo: false,
        autores: expect.any(Array),
      },
      meta: {},
      erros: [],
    });
    expect(corpo.data.autores.map((a) => a.projetoEquipeId).sort()).toEqual(
      [membroTecnico, membroEstudante].sort(),
    );
    expect(corpo.data.autores.find((a) => a.projetoEquipeId === membroTecnico)?.nome).toBe(
      "Técnico de Teste",
    );
    producaoId = corpo.data.id;
  });

  it("autor da equipe de OUTRO projeto → 422; meta de outro projeto → 422; url inválida → 400", async () => {
    const autor = await app.request(
      "/producoes",
      comCookie(admin, {
        method: "POST",
        json: {
          projetoId: projetoA,
          titulo: "X",
          tipo: "relatorio_tecnico",
          projetoEquipeIds: [membroTecnico, membroB],
        },
      }),
    );
    expect(autor.status).toBe(422);
    expect(await json(autor)).toEqual({
      data: [],
      meta: { codigo: "AUTOR_FORA_DA_EQUIPE" },
      erros: ["Os autores precisam ser membros da equipe deste projeto"],
    });

    const metaErrada = await app.request(
      "/producoes",
      comCookie(admin, {
        method: "POST",
        json: { projetoId: projetoA, titulo: "X", tipo: "relatorio_tecnico", metaId: metaB },
      }),
    );
    expect(metaErrada.status).toBe(422);
    expect((await json(metaErrada)).meta).toEqual({ codigo: "META_INVALIDA" });

    const url = await app.request(
      "/producoes",
      comCookie(admin, {
        method: "POST",
        json: { projetoId: projetoA, titulo: "X", tipo: "relatorio_tecnico", url: "não é link" },
      }),
    );
    expect(url.status).toBe(400);
    expect((await json(url)).meta).toEqual({ campos: { url: "Link inválido" } });
  });

  it("PATCH com projetoEquipeIds substitui os autores (sem duplicar) e preserva o resto", async () => {
    const res = await app.request(
      `/producoes/${producaoId}`,
      comCookie(tecnico, {
        method: "PATCH",
        json: { concluidaEm: "2026-05-20", projetoEquipeIds: [membroEstudante] },
      }),
    );
    expect(res.status).toBe(200);
    const data = (await json<Producao>(res)).data;
    expect(data).toMatchObject({
      concluidaEm: "2026-05-20",
      metaId: metaA,
      titulo: `${PREFIXO_TESTE}Relatório de solos`,
    });
    expect(data.autores.map((a) => a.projetoEquipeId)).toEqual([membroEstudante]);

    // O técnico saiu (soft delete); o estudante manteve a mesma linha
    const linhas = await db
      .select({ projetoEquipeId: producaoAutor.projetoEquipeId, deletedAt: producaoAutor.deletedAt })
      .from(producaoAutor)
      .where(eq(producaoAutor.producaoId, producaoId));
    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.projetoEquipeId === membroTecnico)?.deletedAt).toEqual(expect.any(Date));
    expect(linhas.find((l) => l.projetoEquipeId === membroEstudante)?.deletedAt).toBeNull();

    const semAutores = await app.request(
      `/producoes/${producaoId}`,
      comCookie(tecnico, { method: "PATCH", json: { resumo: "Resumo" } }),
    );
    expect((await json<Producao>(semAutores)).data.autores.map((a) => a.projetoEquipeId)).toEqual([
      membroEstudante,
    ]);
  });

  it("GET lista com filtros (concluida, tipo, metaId, busca); sort fora da allowlist → 400", async () => {
    await app.request(
      "/producoes",
      comCookie(tecnico, {
        method: "POST",
        json: {
          projetoId: projetoA,
          titulo: `${PREFIXO_TESTE}Resumo em andamento`,
          tipo: "resumo_cientifico",
        },
      }),
    );

    const concluidas = await json<Producao[]>(
      await app.request(`/producoes?projetoId=${projetoA}&concluida=true`, comCookie(tecnico)),
    );
    expect(concluidas.meta).toEqual({ total: 1, limit: 10, offset: 0 });
    expect(concluidas.data[0].id).toBe(producaoId);

    const pendentes = await json<Producao[]>(
      await app.request("/producoes?concluida=false", comCookie(tecnico)),
    );
    expect(pendentes.data.map((p) => p.titulo)).toEqual([`${PREFIXO_TESTE}Resumo em andamento`]);

    const porMeta = await json(
      await app.request(`/producoes?metaId=${metaA}&busca=solos`, comCookie(tecnico)),
    );
    expect(porMeta.meta).toMatchObject({ total: 1 });

    const sort = await app.request("/producoes?sort=url:asc", comCookie(tecnico));
    expect(sort.status).toBe(400);
  });
});

describe("arquivo (sem storage)", () => {
  it("sem arquivo: GET e DELETE do arquivo → 404", async () => {
    const baixar = await app.request(`/producoes/${producaoId}/arquivo`, comCookie(tecnico));
    expect(baixar.status).toBe(404);
    expect(await json(baixar)).toEqual({ data: [], meta: {}, erros: ["A produção não tem arquivo"] });

    const remover = await app.request(
      `/producoes/${producaoId}/arquivo`,
      comCookie(tecnico, { method: "DELETE" }),
    );
    expect(remover.status).toBe(404);
  });

  it("upload que não é multipart → 400; tipo não aceito → 415 (antes de tocar o storage)", async () => {
    const semMultipart = await app.request(
      `/producoes/${producaoId}/arquivo`,
      comCookie(tecnico, { method: "POST", json: {} }),
    );
    expect(semMultipart.status).toBe(400);

    const form = new FormData();
    form.append("arquivo", new File(["texto"], "nota.txt", { type: "text/plain" }));
    const tipo = await app.request(`/producoes/${producaoId}/arquivo`, {
      method: "POST",
      headers: { Cookie: tecnico, Origin: ORIGIN },
      body: form,
    });
    expect(tipo.status).toBe(415);
  });
});

describe("escopo por projeto", () => {
  it("produção do projeto B é invisível ao técnico (lista, detalhe, arquivo e filtro → 404)", async () => {
    const criada = await app.request(
      "/producoes",
      comCookie(admin, {
        method: "POST",
        json: {
          projetoId: projetoB,
          titulo: `${PREFIXO_TESTE}Relatório B`,
          tipo: "relatorio_pesquisa",
          metaId: metaB,
          projetoEquipeIds: [membroB],
        },
      }),
    );
    expect(criada.status).toBe(201);
    producaoB = (await json<Producao>(criada)).data.id;

    const lista = await json<Producao[]>(await app.request("/producoes", comCookie(tecnico)));
    expect(lista.data.map((p) => p.id)).not.toContain(producaoB);

    const detalhe = await app.request(`/producoes/${producaoB}`, comCookie(tecnico));
    expect(detalhe.status).toBe(404);
    expect(await json(detalhe)).toEqual({ data: [], meta: {}, erros: ["Produção não encontrada"] });
    expect((await app.request(`/producoes/${producaoB}/arquivo`, comCookie(tecnico))).status).toBe(404);
    expect((await app.request(`/producoes?projetoId=${projetoB}`, comCookie(tecnico))).status).toBe(404);
    const patch = await app.request(
      `/producoes/${producaoB}`,
      comCookie(tecnico, { method: "PATCH", json: { titulo: "Invadido" } }),
    );
    expect(patch.status).toBe(404);
  });
});

describe("exclusão", () => {
  it("DELETE 204 → GET 404 → DELETE de novo 404", async () => {
    const res = await app.request(`/producoes/${producaoId}`, comCookie(tecnico, { method: "DELETE" }));
    expect(res.status).toBe(204);
    expect((await app.request(`/producoes/${producaoId}`, comCookie(tecnico))).status).toBe(404);
    expect(
      (await app.request(`/producoes/${producaoId}`, comCookie(tecnico, { method: "DELETE" }))).status,
    ).toBe(404);
  });

  it("trigger registrou INSERT, UPDATEs e DELETE da produção com o técnico", async () => {
    const linhas = await db
      .select({ operacao: historicoAlteracao.operacao, alteradoPor: historicoAlteracao.alteradoPor })
      .from(historicoAlteracao)
      .where(and(eq(historicoAlteracao.tabela, "producoes"), eq(historicoAlteracao.registroId, producaoId)))
      .orderBy(asc(historicoAlteracao.id));
    expect(linhas.map((l) => l.operacao)).toEqual(["INSERT", "UPDATE", "UPDATE", "DELETE"]);
    expect(linhas.every((l) => l.alteradoPor === tecnicoId)).toBe(true);
  });
});
