/**
 * Mensagens em pt-BR para os erros do better-auth. O `auth.handler` responde
 * `{ code, message }` em inglês; o wrapper de `/auth/*` (app.ts) troca só o
 * `message` dos códigos conhecidos — `code`, status, headers e cookies ficam
 * intactos, então o cliente segue podendo tratar por `code`.
 */
export const MENSAGENS_AUTH: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha inválidos",
  INVALID_EMAIL: "E-mail inválido",
  INVALID_PASSWORD: "Senha inválida",
  PASSWORD_TOO_SHORT: "A senha é muito curta",
  PASSWORD_TOO_LONG: "A senha é muito longa",
  USER_NOT_FOUND: "Usuário não encontrado",
  USER_EMAIL_NOT_FOUND: "E-mail não encontrado",
  USER_ALREADY_EXISTS: "Já existe um usuário com este e-mail",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe um usuário com este e-mail",
  EMAIL_PASSWORD_SIGN_UP_DISABLED: "Cadastro por e-mail e senha desabilitado",
  EMAIL_PASSWORD_DISABLED: "Login por e-mail e senha desabilitado",
  EMAIL_NOT_VERIFIED: "E-mail ainda não verificado",
  SESSION_EXPIRED: "Sessão expirada — entre novamente",
  SESSION_NOT_FRESH: "Sessão antiga demais para esta ação — entre novamente",
  FAILED_TO_CREATE_USER: "Não foi possível criar o usuário",
  FAILED_TO_CREATE_SESSION: "Não foi possível criar a sessão",
  FAILED_TO_UPDATE_USER: "Não foi possível atualizar o usuário",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta conta não tem senha cadastrada",
  INVALID_TOKEN: "Link inválido ou já utilizado",
  TOKEN_EXPIRED: "Link expirado — solicite um novo",
  INVALID_ORIGIN: "Origem da requisição não permitida",
  BANNED_USER: "Sua conta foi bloqueada",
  TOO_MANY_REQUESTS: "Muitas tentativas — aguarde e tente novamente",
  VALIDATION_ERROR: "Dados inválidos",
  UNAUTHORIZED: "Não autenticado",
  FORBIDDEN: "Sem permissão para esta ação",
  // plugin admin
  YOU_CANNOT_BAN_YOURSELF: "Você não pode bloquear a si mesmo",
  YOU_CANNOT_REMOVE_YOURSELF: "Você não pode remover a si mesmo",
  YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Sem permissão para criar usuários",
  YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "Sem permissão para listar usuários",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "Sem permissão para alterar usuários",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "Sem permissão para excluir usuários",
  YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Sem permissão para bloquear usuários",
  YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "Sem permissão para alterar o papel de usuários",
  YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "Sem permissão para definir a senha de usuários",
  YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "Sem permissão para personificar usuários",
  YOU_CANNOT_IMPERSONATE_ADMINS: "Não é possível personificar administradores",
};

/**
 * Traduz a resposta de erro do better-auth (status >= 400 com JSON `{ code }`).
 * Qualquer outra resposta (sucesso, redirect, código desconhecido) volta como veio.
 */
export async function traduzirRespostaAuth(res: Response): Promise<Response> {
  if (res.status < 400 || !res.headers.get("content-type")?.includes("application/json")) return res;

  let corpo: { code?: unknown; message?: unknown } & Record<string, unknown>;
  try {
    corpo = await res.clone().json();
  } catch {
    return res;
  }
  const mensagem = typeof corpo?.code === "string" ? MENSAGENS_AUTH[corpo.code] : undefined;
  if (!mensagem) return res;

  const headers = new Headers(res.headers);
  headers.delete("content-length"); // o corpo mudou de tamanho
  return new Response(JSON.stringify({ ...corpo, message: mensagem }), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
