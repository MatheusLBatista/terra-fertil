/**
 * Mensagens em pt-BR para os erros do better-auth (`error.code` / `error.status`
 * devolvidos pelo `authClient`). O backend traduz as mensagens dele; este mapa
 * cobre os códigos por garantia e os status sem código (429, rede).
 */
export type ErroAuth = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

const POR_CODIGO: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Não foi possível entrar. Verifique e-mail e senha.",
  INVALID_PASSWORD: "Senha incorreta.",
  INVALID_EMAIL: "Informe um e-mail válido.",
  USER_NOT_FOUND: "Usuário não encontrado.",
  USER_EMAIL_NOT_FOUND: "Não há conta com este e-mail.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail.",
  EMAIL_NOT_VERIFIED: "Confirme seu e-mail antes de entrar.",
  PASSWORD_TOO_SHORT: "A senha é curta demais.",
  PASSWORD_TOO_LONG: "A senha é longa demais.",
  INVALID_TOKEN: "Link inválido ou expirado. Peça um novo.",
  SESSION_EXPIRED: "Sua sessão expirou. Entre de novo.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta conta entra pelo Google — use o botão do Google.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "Esta conta do Google já está vinculada a outro usuário.",
  ACCOUNT_TEMPORARILY_LOCKED: "Muitas tentativas. A conta ficou bloqueada temporariamente.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Aguarde alguns minutos.",
  BANNED_USER: "Acesso bloqueado. Fale com um administrador.",
  FAILED_TO_CREATE_USER: "Não foi possível criar o usuário.",
  NO_DATA_TO_UPDATE: "Nada para atualizar.",
  INVALID_ROLE_TYPE: "Papel inválido.",
  YOU_CANNOT_BAN_YOURSELF: "Você não pode banir a si mesmo.",
  YOU_CANNOT_REMOVE_YOURSELF: "Você não pode remover a si mesmo.",
  YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "Sem permissão para alterar papéis.",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Sem permissão para criar usuários.",
  YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "Sem permissão para listar usuários.",
  YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Sem permissão para banir usuários.",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "Sem permissão para remover usuários.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "Sem permissão para editar usuários.",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "Sem permissão para definir senhas.",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: "Sem permissão para alterar e-mails.",
  YOU_ARE_NOT_ALLOWED_TO_GET_USER: "Sem permissão para ver este usuário.",
};

const POR_STATUS: Record<number, string> = {
  0: "Sem conexão com o servidor.",
  401: "Não foi possível entrar. Verifique e-mail e senha.",
  403: "Sem permissão para esta ação.",
  429: "Muitas tentativas. Aguarde alguns minutos.",
};

/** Texto em inglês? Não repassamos ao usuário (o backend já traduz as mensagens dele). */
const pareceIngles = (texto: string) =>
  /\b(the|you|not|is|are|invalid|user|password|email|failed|already|allowed)\b/i.test(texto);

/**
 * Mensagem exibível a partir do erro do `authClient`. Ordem: 429 → código
 * conhecido → status conhecido → mensagem da API (se não estiver em inglês) → padrão.
 */
export function mensagemErroAuth(
  erro: ErroAuth | null | undefined,
  padrao = "Não foi possível concluir.",
): string {
  if (!erro) return padrao;
  if (erro.status === 429) return POR_STATUS[429];
  if (erro.code && POR_CODIGO[erro.code]) return POR_CODIGO[erro.code];
  if (typeof erro.status === "number" && POR_STATUS[erro.status]) return POR_STATUS[erro.status];
  if (erro.message && !pareceIngles(erro.message)) return erro.message;
  return padrao;
}
