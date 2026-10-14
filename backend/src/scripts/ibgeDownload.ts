import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Baixa estados e municípios da API de localidades do IBGE e salva os JSON em
 * `src/seeds/data/`. Os arquivos são COMMITADOS — os seeds leem do disco e
 * funcionam offline; rode este script só quando quiser atualizar a base.
 *
 * Uso: npm run ibge:download
 */

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades";

type IbgeEstado = { id: number; sigla: string; nome: string };
type IbgeMunicipio = {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { id: number } } };
  "regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { id: number } } };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE respondeu ${res.status} para ${url}`);
  return res.json() as Promise<T>;
}

/** A UF vem aninhada em caminhos diferentes conforme a divisão regional. */
function ufDoMunicipio(m: IbgeMunicipio): number {
  const uf =
    m.microrregiao?.mesorregiao?.UF?.id ??
    m["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.id ??
    // Fallback: os 2 primeiros dígitos do código IBGE do município são a UF
    Number(String(m.id).slice(0, 2));
  return uf;
}

async function main() {
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "seeds", "data");
  mkdirSync(dataDir, { recursive: true });

  console.log("Baixando estados do IBGE...");
  const estados = await fetchJson<IbgeEstado[]>(`${IBGE}/estados?orderBy=nome`);
  const estadosOut = estados.map((e) => ({ id: e.id, nome: e.nome, sigla: e.sigla }));
  writeFileSync(join(dataDir, "estados.json"), JSON.stringify(estadosOut, null, 2));
  console.log(`✓ ${estadosOut.length} estados → src/seeds/data/estados.json`);

  console.log("Baixando municípios do IBGE (pode demorar alguns segundos)...");
  const municipios = await fetchJson<IbgeMunicipio[]>(`${IBGE}/municipios`);
  const municipiosOut = municipios
    .map((m) => ({ id: m.id, nome: m.nome, estadoId: ufDoMunicipio(m) }))
    .sort((a, b) => a.id - b.id);
  writeFileSync(join(dataDir, "municipios.json"), JSON.stringify(municipiosOut));
  console.log(`✓ ${municipiosOut.length} municípios → src/seeds/data/municipios.json`);
}

main().catch((err) => {
  console.error("✖ Falha no download do IBGE:", err);
  process.exit(1);
});
