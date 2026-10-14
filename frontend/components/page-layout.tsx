"use client";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { grupoDaTela } from "@/lib/navegacao";
import { APP_NOME } from "@/lib/app";

interface PageLayoutProps {
  title: string;
  /** Conteúdo ao lado do título (ex.: badge de status). */
  titleExtra?: React.ReactNode;
  breadcrumb?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageLayout({ title, titleExtra, breadcrumb, actions, children }: PageLayoutProps) {
  const pathname = usePathname();
  // Grupo do menu (ex.: "Cadastros") antes do nome da tela, quando houver.
  const grupo = grupoDaTela(pathname)?.label;

  return (
    <>
      <title>{`${title} · ${APP_NOME}`}</title>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Breadcrumb>
          <BreadcrumbList>
            {grupo && (
              <>
                <BreadcrumbItem className="text-muted-foreground">{grupo}</BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            <BreadcrumbItem>
              <BreadcrumbPage>{breadcrumb ?? title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="space-y-6 p-6">
        {/* Título e ações quebram de linha em telas estreitas; o título encolhe
            (min-w-0) e as ações não. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {titleExtra}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </>
  );
}
