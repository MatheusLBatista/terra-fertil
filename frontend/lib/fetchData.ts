import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Erro lançado pelo `fetchData`: um `Error` de verdade com o `status` anexado.
 * Resposta `!ok`: `message` = `erros[0]` ?? `message` da API ?? "Erro <status>
 * na API", mais os campos do envelope. Falha de rede: `status: 0` e
 * "Sem conexão com o servidor". `requestId` é o `x-request-id` da API, quando
 * o CORS o expõe (correlação com os logs do backend).
 */
export type ErroApi = Error & {
  status: number;
  erros?: string[];
  data?: unknown;
  meta?: unknown;
  requestId?: string;
};

export type ValorQuery = string | number | boolean | null | undefined;

export type OpcoesFetch = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serializado com URLSearchParams; `undefined`, `null` e "" ficam de fora. */
  query?: Record<string, ValorQuery>;
  /** Enviado como JSON sempre que for `!== undefined`. */
  body?: unknown;
  /** O `signal` que o React Query passa ao `queryFn` — cancela a request anterior. */
  signal?: AbortSignal;
  /** Multipart: vai como corpo sem Content-Type (o browser define o boundary). */
  formData?: FormData;
};

function erroApi(mensagem: string, status: number, campos: Record<string, unknown> = {}): ErroApi {
  const erro = Object.assign(new Error(mensagem), campos, { status }) as ErroApi;
  erro.name = "ErroApi";
  return erro;
}

export function montarQuery(query?: Record<string, ValorQuery>): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor === undefined || valor === null || valor === "") continue;
    params.set(chave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export async function fetchData<T>(path: string, opcoes: OpcoesFetch = {}): Promise<T> {
  const { method = "GET", query, body, signal, formData } = opcoes;
  const startedAt = performance.now();
  const url = `${path}${montarQuery(query)}`;

  // A sessão viaja no cookie (`credentials: "include"`) — não há token no cliente.
  const options: RequestInit = { method, credentials: "include", signal };

  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers = { "Content-Type": "application/json" };
  }

  let response: Response;
  try {
    response = await fetch(`${env.API_URL}${url}`, options);
  } catch (erro) {
    // Cancelamento pelo React Query (troca de filtro) não é erro de rede.
    if (signal?.aborted) throw erro;
    logger.error(`API ${method} ${url} — sem conexão`, { method, url }, "fetchData");
    throw erroApi("Sem conexão com o servidor", 0);
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  const requestId = response.headers.get("x-request-id") ?? undefined;

  // 204 (DELETE) não tem corpo — `response.json()` estouraria.
  if (response.status === 204) return undefined as T;

  let json;
  try {
    json = await response.json();
  } catch {
    json = { message: "Erro ao processar a resposta da API" };
  }

  if (!response.ok) {
    const corpo: Record<string, unknown> =
      typeof json === "object" && json !== null ? json : { erros: [String(json)] };
    const erros = Array.isArray(corpo.erros) ? (corpo.erros as string[]) : undefined;
    const mensagem =
      erros?.[0] ??
      (typeof corpo.message === "string" ? corpo.message : undefined) ??
      `Erro ${response.status} na API`;

    // 401 = sessão ausente/expirada (requireAuth do backend). 403 é falta de
    // permissão do papel e NÃO desloga — a tela mostra o erro. Na própria tela
    // de login o 401 é esperado (credenciais erradas) e não redireciona.
    if (response.status === 401) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        const destino = window.location.pathname + window.location.search;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reload completo de propósito: /logout limpa a sessão e volta ao login
        window.location.href = `/logout?next=${encodeURIComponent(destino)}&motivo=expirada`;
      }
    }

    // 4xx é resposta esperada (validação, permissão, não encontrado): warn.
    // Só 5xx e rede são error.
    const contexto = { status: response.status, method, url, errors: erros, message: mensagem, requestId };
    if (response.status >= 500)
      logger.error(`API ${method} ${url} — ${response.status}`, contexto, "fetchData");
    else logger.warn(`API ${method} ${url} — ${response.status}`, contexto, "fetchData");

    // `status` viaja junto: o retry do React Query usa para não repetir 4xx.
    // Os campos do envelope (`erros`, `data`, `meta`) continuam acessíveis —
    // `mensagemDeErro` lê `erros` primeiro.
    throw erroApi(mensagem, response.status, { ...corpo, requestId });
  }

  if (elapsedMs > 1500) {
    logger.warn(
      `API lenta ${method} ${url}`,
      { method, url, status: response.status, elapsedMs, requestId },
      "fetchData",
    );
  }

  return json as T;
}

/** `true` quando o erro é um 403 da API (falta de permissão do papel). */
export function ehSemPermissao(erro: unknown): boolean {
  return (erro as { status?: number } | null)?.status === 403;
}

/**
 * Mensagem exibível a partir do erro lançado pelo `fetchData` (ou pelo
 * `authClient`). 403 vira "Sem permissão"; a API devolve `{ erros: string[] }`;
 * o `catch` de rede devolve `Error`.
 */
export function mensagemDeErro(erro: unknown, padrao = "Não foi possível concluir a operação."): string {
  if (ehSemPermissao(erro)) return "Sem permissão para esta ação.";
  const erros = (erro as { erros?: string[] })?.erros;
  if (erros?.length) return erros.join(" · ");
  const message = (erro as { message?: string })?.message;
  return message || padrao;
}
