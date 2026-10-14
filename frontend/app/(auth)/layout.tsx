"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { setUsuarioAtual } from "@/lib/logger";
import Loading from "@/components/Loading";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { EnterFieldNavigation } from "@/components/EnterFieldNavigation";
import { ScrollToTop } from "@/components/scroll-to-top";

// O `SidebarProvider` grava `sidebar_state=true|false` (cookie) a cada toggle;
// ler aqui faz o menu abrir do jeito que o usuário deixou. Só roda no cliente:
// este layout renderiza `<Loading />` até a sessão chegar.
function sidebarAbertoDoCookie(): boolean {
  if (typeof document === "undefined") return true;
  const m = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
  return m ? m[1] === "true" : true;
}

/**
 * Shell autenticado: tudo dentro de `(auth)/` só monta com sessão válida.
 * A sessão é do Better Auth (cookie httpOnly) — o que cada papel pode ver é
 * decidido pelo backend; o front só esconde o que ele recusaria.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  // Sem sessão válida (cookie vencido que passou pelo proxy): /logout limpa o
  // cookie e devolve ao login com o destino original em `next`.
  useEffect(() => {
    if (!isPending && !session) {
      const destino = window.location.pathname + window.location.search;
      router.replace(`/logout?next=${encodeURIComponent(destino)}`);
    }
  }, [isPending, session, router]);

  // Todo log do cliente sai com o `userId` da sessão.
  useEffect(() => {
    setUsuarioAtual(session?.user.id);
    return () => setUsuarioAtual(undefined);
  }, [session?.user.id]);

  if (isPending) return <Loading />;
  if (!session) return null;

  return (
    <SidebarProvider defaultOpen={sidebarAbertoDoCookie()}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-1 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <EnterFieldNavigation />
      <AppSidebar />
      <SidebarInset id="conteudo" tabIndex={-1} className="outline-none">
        {children}
      </SidebarInset>
      <ScrollToTop />
    </SidebarProvider>
  );
}
