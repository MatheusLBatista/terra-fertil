import app from "../app.ts";
import { USUARIOS_DEMO } from "../seeds/usuarios.ts";

/**
 * Helpers HTTP dos testes de integração — tudo via `app.request()` do Hono,
 * sem subir servidor nem porta.
 *
 * Toda requisição leva `Origin: http://localhost:3000` (TRUSTED_ORIGINS): o
 * better-auth valida a origem no login e o CORS do app a ecoa — o mesmo que o
 * navegador do painel faz.
 */
export const ORIGIN = "http://localhost:3000";

export type Envelope<T = unknown> = { data: T; meta: Record<string, unknown>; erros: string[] };

type Init = Omit<RequestInit, "body"> & {
  /** Objeto serializado como JSON (define o Content-Type). */
  json?: unknown;
  /** Corpo cru — para testar JSON inválido, corpo grande etc. */
  body?: string;
};

function montar(init: Init, extra: Record<string, string>): RequestInit {
  const { json, body, headers, ...resto } = init;
  const cabecalhos = new Headers(headers);
  cabecalhos.set("Origin", ORIGIN);
  for (const [k, v] of Object.entries(extra)) cabecalhos.set(k, v);
  if (json !== undefined && !cabecalhos.has("Content-Type"))
    cabecalhos.set("Content-Type", "application/json");
  return { ...resto, headers: cabecalhos, body: json !== undefined ? JSON.stringify(json) : body };
}

/** Requisição sem sessão (rotas públicas, 401 esperado etc.). */
export const anonima = (init: Init = {}): RequestInit => montar(init, {});

/** Requisição autenticada com o cookie devolvido por `login()`. */
export const comCookie = (cookie: string, init: Init = {}): RequestInit => montar(init, { Cookie: cookie });

/**
 * Login pelo better-auth (`POST /auth/sign-in/email`) e devolve o header
 * `Cookie` pronto. A senha das contas do seed vem de `USUARIOS_DEMO`; para
 * outras contas passe-a explicitamente. Faça UM login por arquivo (beforeAll).
 */
export async function login(email: string, password?: string): Promise<string> {
  const senha = password ?? USUARIOS_DEMO.find((u) => u.email === email)?.password;
  if (!senha) throw new Error(`Senha desconhecida para ${email} — passe-a no segundo argumento`);

  const res = await app.request(
    "/auth/sign-in/email",
    anonima({ method: "POST", json: { email, password: senha } }),
  );
  if (res.status !== 200) throw new Error(`Login de ${email} falhou (${res.status}): ${await res.text()}`);

  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error(`Login de ${email} não devolveu set-cookie`);
  return cookie;
}

/** Corpo da resposta tipado como envelope `{ data, meta, erros }`. */
export const json = <T = unknown>(res: Response) => res.json() as Promise<Envelope<T>>;
