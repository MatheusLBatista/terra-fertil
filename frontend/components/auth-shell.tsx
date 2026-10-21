import { LogoCompleto } from "@/components/logo";
import Link from "next/link";
import { APP_NOME } from "@/lib/app";

/**
 * Moldura das telas públicas de autenticação: logo do projeto + formulário à
 * esquerda e o painel institucional à direita (logos FSLab + IFRO). Abaixo de
 * `lg` o painel some e os logos institucionais descem para o rodapé.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <main className="flex flex-col gap-8 p-6 md:p-10">
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <Link href="/" className="rounded-md transition-opacity hover:opacity-80">
            <LogoCompleto titulo={`${APP_NOME} — início`} className="h-32 md:h-40" />
          </Link>
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <footer className="flex items-center justify-center gap-8 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fslab_logo_dark.svg" alt="Logo do FSLab" className="h-7 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fslab_logo_white.svg" alt="Logo do FSLab" className="hidden h-7 w-auto dark:block" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ifro.png" alt="Logo do IFRO" className="h-7 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ifro_white.png" alt="Logo do IFRO" className="hidden h-7 w-auto dark:block" />
        </footer>
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
