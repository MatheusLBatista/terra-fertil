"use client";

import { useState } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { toast } from "react-toastify";
import { authClient } from "@/lib/auth-client";
import { SIGNUP_HABILITADO } from "@/lib/app";
import { mensagemErroAuth } from "@/lib/erros-auth";
import { SENHA_DICA, SENHA_MIN, senhaValida } from "@/lib/senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "@/components/auth-shell";

// Cadastro público só com NEXT_PUBLIC_SIGNUP_ENABLED=true (e o back-end
// aceitando sign-up); desligado, contas são criadas pelo admin em /usuarios.
export default function RegistrarPage() {
  if (!SIGNUP_HABILITADO) redirect("/login");
  return <Registrar />;
}

function Registrar() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading] = useState(false);

  const senhaCurta = senha.length > 0 && !senhaValida(senha);
  const naoConfere = confirma.length > 0 && confirma !== senha;
  const podeEnviar =
    nome.trim().length > 0 && email.trim().length > 0 && senhaValida(senha) && senha === confirma;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar) return;

    setLoading(true);
    const { data, error } = await authClient.signUp.email({
      name: nome.trim(),
      email: email.trim(),
      password: senha,
    });
    setLoading(false);

    if (error) {
      toast.error(
        error.status === 422
          ? "Já existe uma conta com este e-mail."
          : mensagemErroAuth(error, "Não foi possível criar a conta."),
      );
      return;
    }

    // Sem sessão na resposta (ex.: e-mail precisa ser confirmado), volta ao login.
    if (!data?.token) {
      toast.success("Conta criada. Faça login.");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reload completo de propósito: limpa o estado do cadastro
      window.location.href = "/login";
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reload completo: a sessão nova é lida antes do shell montar
    window.location.href = "/dashboard";
  };

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold">Criar conta</h1>
          <p className="text-sm text-muted-foreground">A conta nasce com o papel padrão do sistema.</p>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              autoComplete="name"
              maxLength={80}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

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
            <Label htmlFor="senha">Senha</Label>
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

          <Button type="submit" className="w-full" disabled={!podeEnviar || loading}>
            {loading ? (
              <>
                <Spinner aria-label="Criando conta" /> Criando conta…
              </>
            ) : (
              "Criar conta"
            )}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
