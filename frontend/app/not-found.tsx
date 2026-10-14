"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { authClient } from "@/lib/auth-client";

// `history.length` só existe no cliente e não muda enquanto a tela está
// montada: useSyncExternalStore lê uma vez (false no servidor/hidratação),
// sem setState em efeito.
const semAssinatura = () => () => {};
const temHistoricoNoCliente = () => window.history.length > 1;
const temHistoricoNoServidor = () => false;

/**
 * 404 do App Router. O destino depende da sessão: com ela, volta ao dashboard;
 * sem, ao login. "Voltar" só aparece quando há para onde voltar.
 */
export default function NotFound() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const temHistorico = useSyncExternalStore(semAssinatura, temHistoricoNoCliente, temHistoricoNoServidor);

  const destino = session ? "/dashboard" : "/login";

  return (
    <main className="flex min-h-svh flex-col items-center justify-center p-8">
      <EmptyState
        icon={FileQuestion}
        title="Página não encontrada"
        description="O endereço não existe ou foi movido."
        action={
          <div className="flex flex-col items-center gap-4">
            <code className="max-w-md font-mono text-xs break-all text-muted-foreground">{pathname}</code>
            <div className="flex gap-2">
              {temHistorico && (
                <Button variant="outline" onClick={() => router.back()}>
                  Voltar
                </Button>
              )}
              <Button nativeButton={false} disabled={isPending} render={<Link href={destino} />}>
                {session ? "Ir para o dashboard" : "Ir para o login"}
              </Button>
            </div>
          </div>
        }
      />
    </main>
  );
}
