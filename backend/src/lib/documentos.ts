/**
 * Documentos e telefone brasileiros — normalização (só dígitos) e validação do
 * dígito verificador. O banco guarda só dígitos; a máscara é coisa da tela.
 *
 *   somenteDigitos("07.638.987/0001-13") → "07638987000113"
 *   cnpjValido("07638987000113")         → true
 *   cpfValido("52998224725")             → true
 *   normalizarTelefone("(69) 99345-3103") → "5569993453103"
 */

export const somenteDigitos = (valor: string) => valor.replace(/\D/g, "");

const repetido = (d: string) => /^(\d)\1+$/.test(d);

/** Dígito verificador mod 11 com os pesos dados (CPF e CNPJ usam a mesma regra). */
function digito(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || repetido(d)) return false;
  const d1 = digito(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14 || repetido(d)) return false;
  const d1 = digito(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/**
 * Telefone brasileiro → E.164 sem "+" (`55` + DDD + número). Aceita com ou sem
 * DDI, com o zero de operadora/tronco à esquerda ("069…", "55069…") e máscara.
 * Devolve `undefined` se não sobrar um número de 10 ou 11 dígitos após o DDI.
 */
export function normalizarTelefone(valor: string): string | undefined {
  let d = somenteDigitos(valor);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return undefined;
  return `55${d}`;
}

/** E-mail técnico de quem não tem e-mail (o `user.email` do better-auth é obrigatório). */
export const DOMINIO_SEM_EMAIL = "sem-email.invalid";

export const emailTecnico = (chave: string) => `${chave}@${DOMINIO_SEM_EMAIL}`;

export const ehEmailTecnico = (email: string) => email.endsWith(`@${DOMINIO_SEM_EMAIL}`);
