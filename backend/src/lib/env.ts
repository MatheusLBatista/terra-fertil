import "dotenv/config";
import { z } from "zod";
import { EnvSchema, SENHA_DEMO, type Env } from "./envSchema.ts";

/**
 * Validação do `.env` na SUBIDA (fail fast): configuração ausente ou inválida
 * derruba o boot com a lista completa de problemas, em vez de estourar em
 * runtime no meio de uma request. O schema (e as derivações) está em
 * `envSchema.ts`; este módulo é a ÚNICA porta para `process.env`.
 *
 * NÃO importe o logger aqui (o logger importa `env`; seria ciclo).
 */

// Mensagens do zod em pt-BR para toda a API. Este é o primeiro módulo carregado
// (app.ts e scripts importam `env` antes de qualquer schema), então vale
// inclusive para os erros de validação das rotas e do próprio .env.
z.config(z.locales.ptBR());

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("✖ Configuração inválida no .env — corrija antes de subir a API:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env: Env = parsed.data;
export { SENHA_DEMO };
export type { Env };
