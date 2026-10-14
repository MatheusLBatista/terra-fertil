import { Logo } from "@/components/logo";
import Link from "next/link";
import { APP_NOME } from "@/lib/app";

/**
 * Moldura das telas públicas de autenticação: formulário à esquerda e o painel
 * institucional à direita (logos FSLab + IFRO).
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <main className="flex flex-col gap-4 p-6 md:p-10">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <Logo className="size-7 rounded-lg" />
          {APP_NOME}
        </Link>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>

      <aside className="relative hidden bg-sidebar text-sidebar-foreground lg:block">
        <div className="flex h-screen items-center justify-center">
          <div className="flex flex-col gap-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fslab_logo_white.svg" alt="Logo do FSLab" width="200" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ifro_white.png" alt="Logo do IFRO" width="200" />
          </div>
        </div>
      </aside>
    </div>
  );
}
