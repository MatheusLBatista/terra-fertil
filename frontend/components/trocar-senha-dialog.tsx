"use client";

import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { mensagemErroAuth } from "@/lib/erros-auth";
import { SENHA_DICA, SENHA_MIN, senhaValida } from "@/lib/senha";

type Props = { open: boolean; onClose: () => void };

export function TrocarSenhaDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Trocar senha</DialogTitle>
          <DialogDescription>Informe a senha atual e escolha a nova ({SENHA_DICA}).</DialogDescription>
        </DialogHeader>
        {open && <Formulario onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ onClose }: { onClose: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Senha atual recusada pela API: erro ligado ao campo (some ao editar).
  const [atualIncorreta, setAtualIncorreta] = useState(false);
  const atualRef = useRef<HTMLInputElement>(null);

  const novaCurta = nova.length > 0 && !senhaValida(nova);
  const naoConfere = confirma.length > 0 && confirma !== nova;
  const podeSalvar = atual.length > 0 && senhaValida(nova) && nova === confirma;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      const res = await authClient.changePassword({
        currentPassword: atual,
        newPassword: nova,
        revokeOtherSessions: false,
      });
      if (res.error) {
        if (res.error.code === "INVALID_PASSWORD") {
          setAtualIncorreta(true);
          atualRef.current?.focus();
        } else {
          toast.error(mensagemErroAuth(res.error, "Erro ao trocar a senha."));
        }
        return;
      }
      toast.success("Senha alterada com sucesso.");
      onClose();
    } catch {
      toast.error("Erro ao trocar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="senha-atual">Senha atual</Label>
        <Input
          ref={atualRef}
          id="senha-atual"
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => {
            setAtual(e.target.value);
            setAtualIncorreta(false);
          }}
          aria-invalid={atualIncorreta}
          aria-describedby={atualIncorreta ? "senha-atual-erro" : undefined}
        />
        {atualIncorreta && (
          <p id="senha-atual-erro" role="alert" className="text-xs text-destructive">
            Senha atual incorreta.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="senha-nova">Nova senha</Label>
        <Input
          id="senha-nova"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          placeholder={SENHA_DICA}
          aria-invalid={novaCurta}
          aria-describedby={novaCurta ? "senha-nova-erro" : undefined}
        />
        {novaCurta && (
          <p id="senha-nova-erro" role="alert" className="text-xs text-destructive">
            Use ao menos {SENHA_MIN} caracteres.
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="senha-confirma">Confirmar nova senha</Label>
        <Input
          id="senha-confirma"
          type="password"
          autoComplete="new-password"
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          aria-invalid={naoConfere}
          aria-describedby={naoConfere ? "senha-confirma-erro" : undefined}
        />
        {naoConfere && (
          <p id="senha-confirma-erro" role="alert" className="text-xs text-destructive">
            As senhas não conferem.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={!podeSalvar || salvando}>
          {salvando ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : (
            "Trocar senha"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
