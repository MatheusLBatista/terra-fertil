"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { authClient } from "@/lib/auth-client";
import { mensagemErroAuth } from "@/lib/erros-auth";
import { SENHA_DICA, SENHA_MIN, senhaValida } from "@/lib/senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";

// Destino do link enviado por e-mail pelo Better Auth (`/definir-senha?token=`).
export default function DefinirSenhaPage() {
  return (
    <Suspense fallback={null}>
      <DefinirSenha />
    </Suspense>
  );
}

function DefinirSenha() {
  const token = useSearchParams().get("token");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading] = useState(false);

  const senhaCurta = senha.length > 0 && !senhaValida(senha);
  const naoConfere = confirma.length > 0 && confirma !== senha;
  const podeEnviar = !!token && senhaValida(senha) && senha === confirma;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar) return;

    setLoading(true);
    const { error } = await authClient.resetPassword({ newPassword: senha, token: token! });
    setLoading(false);

    if (error) {
      toast.error(mensagemErroAuth(error, "Link inválido ou expirado. Peça um novo."));
      return;
    }
    toast.success("Senha definida. Faça login.");
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reload completo de propósito: limpa o estado do link de redefinição
    window.location.href = "/login";
  };

  if (!token) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            O endereço não traz o token de redefinição. Peça um link novo.
          </p>
          <Button variant="outline" nativeButton={false} render={<Link href="/recuperar-senha" />}>
            Pedir novo link
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold">Definir nova senha</h1>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="senha">Nova senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="new-password"
              placeholder={SENHA_DICA}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              aria-invalid={senhaCurta}
              aria-describedby={senhaCurta ? "senha-erro" : undefined}
              required
            />
            {senhaCurta && (
              <p id="senha-erro" role="alert" className="text-xs text-destructive">
                Use ao menos {SENHA_MIN} caracteres.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirma">Confirmar senha</Label>
            <Input
              id="confirma"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              aria-invalid={naoConfere}
              aria-describedby={naoConfere ? "confirma-erro" : undefined}
              required
            />
            {naoConfere && (
              <p id="confirma-erro" role="alert" className="text-xs text-destructive">
                As senhas não conferem.
              </p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={!podeEnviar || loading}>
          {loading ? "Salvando…" : "Definir senha"}
        </Button>
      </form>
    </AuthShell>
  );
}
