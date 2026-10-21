import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { EnvSchema, chavesObrigatorias } from "../lib/envSchema.ts";

/**
 * Compara as chaves do `.env` com as do `.env.example` e valida o `.env` com o
 * MESMO schema da API (src/lib/envSchema.ts) — sem subir nada.
 *
 *   bun run env:check            # exit 1 se faltar obrigatória ou valor inválido
 *
 * Não lê `process.env`: os dois arquivos são parseados em separado, então o
 * resultado não depende do ambiente do shell.
 */
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

function lerArquivo(nome: string): Record<string, string> | null {
  const caminho = `${RAIZ}${nome}`;
  return existsSync(caminho) ? parse(readFileSync(caminho, "utf8")) : null;
}

const exemplo = lerArquivo(".env.example");
const atual = lerArquivo(".env");

if (!exemplo) {
  console.error("✖ .env.example não encontrado");
  process.exit(1);
}
if (!atual) {
  console.error("✖ .env não encontrado — copie o .env.example: cp .env.example .env");
  process.exit(1);
}

const obrigatorias = new Set(chavesObrigatorias());
const chavesExemplo = Object.keys(exemplo);
const chavesAtual = new Set(Object.keys(atual));

const faltando = chavesExemplo.filter((k) => !chavesAtual.has(k));
const extras = [...chavesAtual].filter((k) => !(k in exemplo));
const faltandoObrigatorias = faltando.filter((k) => obrigatorias.has(k));

let falhou = false;

if (faltando.length > 0) {
  console.log(`Chaves do .env.example ausentes no .env (${faltando.length}):`);
  for (const k of faltando) console.log(`  - ${k}${obrigatorias.has(k) ? "  ← OBRIGATÓRIA" : ""}`);
}
if (extras.length > 0) {
  console.log(`Chaves no .env que não estão no .env.example (${extras.length}):`);
  for (const k of extras) console.log(`  - ${k}`);
}
if (faltandoObrigatorias.length > 0) falhou = true;

const parsed = EnvSchema.safeParse(atual);
if (!parsed.success) {
  falhou = true;
  console.log("Valores inválidos no .env:");
  for (const issue of parsed.error.issues) console.log(`  - ${issue.path.join(".")}: ${issue.message}`);
}

if (falhou) {
  console.error("\n✖ .env incompleto ou inválido.");
  process.exit(1);
}
console.log(
  `✓ .env ok (${chavesAtual.size} chaves; ${faltando.length} opcionais ausentes, ${extras.length} extras).`,
);
