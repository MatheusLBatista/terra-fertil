"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { authClient } from "@/lib/auth-client";
import { destinoInterno, SIGNUP_HABILITADO } from "@/lib/app";
import { env } from "@/lib/env";
import { mensagemErroAuth } from "@/lib/erros-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth-shell";
import { GoogleIcon } from "@/components/google-icon";

// Login social só aparece com o Google configurado no backend (GOOGLE_CLIENT_ID);
// sem isso o botão levaria a uma tela de erro do Google.
const GOOGLE_HABILITADO = env.GOOGLE_LOGIN;

// Mensagem para o `?error=` com que o Google devolve ao login (errorCallbackURL).
const ERRO_OAUTH: Record<string, string> = {
  social: "Login com Google recusado ou cancelado. Tente de novo ou entre com e-mail e senha.",
  access_denied: "Login com Google recusado: a permissão foi negada.",
};

// `?error=`, `?next=` e `?motivo=` são lidos direto de `window.location` (sem
// useSearchParams, que exigiria Suspense na página): uma leitura só, e `null`
// no servidor/hidratação para o HTML bater com o prerender.
const semAssinatura = () => () => {};
const lerParam = (nome: string) => () => new URLSearchParams(window.location.search).get(nome);
const nuloNoServidor = () => null;
const lerErroOAuth = lerParam("error");
const lerNext = lerParam("next");
const lerMotivo = lerParam("motivo");

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const codigoErroOAuth = useSyncExternalStore(semAssinatura, lerErroOAuth, nuloNoServidor);
  const erroOAuth = codigoErroOAuth ? (ERRO_OAUTH[codigoErroOAuth] ?? ERRO_OAUTH.social) : null;
  const sessaoExpirada = useSyncExternalStore(semAssinatura, lerMotivo, nuloNoServidor) === "expirada";
  // Destino após o login: a tela de onde o proxy/logout mandou para cá.
  const destino =
    destinoInterno(useSyncExternalStore(semAssinatura, lerNext, nuloNoServidor)) ?? "/dashboard";

  const signInWithGoogle = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${env.APP_URL}${destino}`,
      errorCallbackURL: `${env.APP_URL}/login?error=social`,
    });
  };

  const signInWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    await authClient.signIn.email(
      { email, password },
      {
        onRequest: () => setLoading(true),
        onSuccess: () => {
          // Reload completo: garante que a sessão nova seja lida antes do shell montar.
          window.location.href = destino;
        },
        onError: (ctx) => {
          setLoading(false);
          // 401 = credenciais erradas (mensagem genérica de propósito); 403 =
          // conta banida; 429 = limite de tentativas.
          toast.error(mensagemErroAuth(ctx.error, "Não foi possível entrar. Verifique e-mail e senha."));
        },
      },
    );
  };

  return (
    <AuthShell>
      <form onSubmit={signInWithEmail} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold">Entrar</h1>
          <p className="text-sm text-muted-foreground">Acesse o painel administrativo.</p>
        </div>

        {sessaoExpirada && (
          <p role="alert" className="text-sm text-destructive">
            Sua sessão expirou. Entre de novo para continuar.
          </p>
        )}

        {erroOAuth && (
          <p role="alert" className="text-sm text-destructive">
            {erroOAuth}
          </p>
        )}

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center">
              <Label htmlFor="password">Senha</Label>
              <Link href="/recuperar-senha" className="ml-auto text-sm underline-offset-4 hover:underline">
                Esqueceu a senha?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Spinner aria-label="Entrando" /> Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>

          {GOOGLE_HABILITADO && (
            <>
              <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-background px-2 text-muted-foreground">
                  ou continue com
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-3 border-[#747775] bg-white text-sm font-medium text-[#1F1F1F] hover:bg-[#f2f2f2] hover:text-[#1F1F1F] dark:border-[#747775] dark:bg-white dark:hover:bg-[#f2f2f2]"
                onClick={signInWithGoogle}
                disabled={loading}
              >
                <GoogleIcon className="size-5" />
                Continuar com o Google
              </Button>
            </>
          )}
        </div>

        {SIGNUP_HABILITADO && (
          <p className="text-center text-sm text-muted-foreground">
            Sem conta?{" "}
            <Link href="/registrar" className="underline underline-offset-4 hover:text-foreground">
              Criar conta
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
