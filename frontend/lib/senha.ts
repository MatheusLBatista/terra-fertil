import { z } from "zod";

/** Tamanho mínimo da senha — a mesma regra do better-auth no backend. */
export const SENHA_MIN = 8;

export const SENHA_DICA = `mínimo ${SENHA_MIN} caracteres`;

/** Senha obrigatória (cadastro, redefinição, troca). */
export const senhaSchema = z.string().min(SENHA_MIN, `Use ao menos ${SENHA_MIN} caracteres`);

/** Senha opcional (edição pelo admin: em branco mantém a atual). */
export const senhaOpcionalSchema = z
  .string()
  .refine((v) => v.length === 0 || v.length >= SENHA_MIN, `Use ao menos ${SENHA_MIN} caracteres`);

/** Para as telas com `useState` (login, registrar, definir/trocar senha). */
export const senhaValida = (senha: string) => senhaSchema.safeParse(senha).success;
