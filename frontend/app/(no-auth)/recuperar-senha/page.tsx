"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";
import { mensagemErroAuth } from "@/lib/erros-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${env.APP_URL}/definir-senha`,
    });
    setLoading(false);

    if (error) {
      toast.error(mensagemErroAuth(error, "Não foi possível enviar o e-mail de redefinição."));
      return;
    }
    // Resposta idêntica exista ou não a conta: não confirmamos cadastros.
    setEnviado(true);
  };

  if (enviado) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MailCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Verifique seu e-mail</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Se existir uma conta para <strong className="text-foreground">{email}</strong>, enviamos um link
              para definir uma nova senha.
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/login" />}>
            Voltar para o login
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">Enviamos um link para você definir uma nova senha.</p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={!email || loading}>
          {loading ? "Enviando…" : "Enviar link"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Voltar para o login
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
