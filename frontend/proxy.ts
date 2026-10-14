import { NextResponse, type NextRequest } from "next/server";
import { destinoInterno } from "@/lib/app";

/**
 * Gate de sessão no SERVIDOR (convenção `proxy` do Next 16): sem o cookie do
 * better-auth, toda rota redireciona para /login antes de qualquer HTML descer
 * — elimina o flash de loading do gate client-side (que continua existindo
 * como confirmação, já que aqui só dá para checar a PRESENÇA do cookie, não a
 * validade da sessão).
 *
 * Tudo é protegido por padrão; as exceções estão no `matcher` (telas públicas
 * de autenticação, assets do Next e arquivos de `public/`). Tela nova não
 * precisa mexer aqui.
 *
 * A raiz `/` só despacha: com cookie vai ao dashboard, sem ele ao login. Nas
 * demais rotas o destino original vai em `?next=` para o login voltar a ela.
 */
const COOKIES_SESSAO = [
  "better-auth.session_token", // nome configurado no auth.ts do back
  "__Secure-better-auth.session_token", // variante com prefixo em https
];

export function proxy(request: NextRequest) {
  const temSessao = COOKIES_SESSAO.some((nome) => request.cookies.has(nome));
  const { pathname, search } = request.nextUrl;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(temSessao ? "/dashboard" : "/login", request.url));
  }

  if (!temSessao) {
    const login = new URL("/login", request.url);
    const destino = destinoInterno(pathname + search);
    if (destino && destino !== "/dashboard") {
      login.search = `?next=${encodeURIComponent(destino).replace(/%2F/g, "/")}`;
    }
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|registrar|recuperar-senha|definir-senha|logout|_next/|icon\\.svg|apple-icon|favicon\\.ico|.*\\.[a-z0-9]+$).*)",
  ],
};
