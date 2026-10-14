"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleUserRound, Lock, LogOut, ShieldCheck } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";
import { APP_NOME } from "@/lib/app";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { TrocarSenhaDialog } from "@/components/trocar-senha-dialog";
import { usePapel } from "@/lib/papeis";
import { itemAtivo, NAV_GROUPS, type NavItem } from "@/lib/navegacao";

// Estrutura do menu em lib/navegacao.ts — módulo novo entra lá.

const BOTAO_RODAPE =
  "flex size-7 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring focus-visible:outline-none";

// Traço um pouco mais fino que o padrão do lucide (2): fica no peso do menu.
const TRACO = 1.75;

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = authClient.useSession();
  const { papel, podeGerenciar } = usePapel();
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const [senhaOpen, setSenhaOpen] = React.useState(false);

  // /logout encerra a sessão fora do shell (auth): sair aqui e esperar o
  // signOut faria o layout ver a sessão sumir e mandar para /login?next=….
  function handleLogout() {
    router.push("/logout");
  }

  // No celular o menu é um Sheet: fecha ao navegar, senão cobre a tela nova.
  const fecharNoCelular = () => {
    if (isMobile) setOpenMobile(false);
  };

  const navGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((i) => podeGerenciar(i.minimo)),
  })).filter((group) => group.items.length > 0);

  const ativo = (item: NavItem) => itemAtivo(item, pathname);

  function renderItens(itens: NavItem[]) {
    return itens.map((item) => {
      const Icone = item.icon;
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            render={<Link href={item.url} onClick={fecharNoCelular} />}
            isActive={ativo(item)}
            tooltip={item.title}
            className="font-medium text-sidebar-foreground/90"
          >
            <Icone className="size-4 shrink-0" strokeWidth={TRACO} />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {/* Link simples em vez de SidebarMenuButton: o botão aplica altura fixa e
            fundo no hover, o que deformaria a marca. */}
        <Link
          href="/dashboard"
          aria-label="Ir para o dashboard"
          onClick={fecharNoCelular}
          className="flex h-12 items-center gap-2 px-2 transition-opacity group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:opacity-80"
        >
          <Logo className="size-7 rounded-md" />
          {/* Recolhido, sobra só o símbolo — o lettering some na largura do ícone. */}
          <span className="text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            {APP_NOME}
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Menu principal">
          {navGroups.map((group, gi) => (
            <React.Fragment key={group.label ?? `grupo-${gi}`}>
              {gi > 0 && <SidebarSeparator />}
              <SidebarGroup>
                {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
                <SidebarMenu className="gap-1">{renderItens(group.items)}</SidebarMenu>
              </SidebarGroup>
            </React.Fragment>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {/* Expandido: avatar, nome e ações na horizontal.
            Recolhido: as ações empilham acima do avatar, que fica por último —
            é o que sobra visível na largura do ícone. */}
        <div className="flex items-center gap-2 px-2 py-3 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt={session.user.name}
              title={session.user.name}
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span title={session?.user?.name} className="flex shrink-0">
              <CircleUserRound className="size-8 text-sidebar-foreground/70" strokeWidth={1.5} />
            </span>
          )}

          <div className="flex flex-1 flex-col overflow-hidden leading-none group-data-[collapsible=icon]:hidden">
            <span className="flex items-center gap-1.5 truncate text-sm font-medium">
              {session?.user?.name ?? "Usuário"}
              {papel !== "usuario" && (
                <Badge variant="secondary" className="h-4 gap-1 px-1 text-[10px]" title={`Papel: ${papel}`}>
                  <ShieldCheck className="size-2.5" />
                  {papel}
                </Badge>
              )}
            </span>
            <span className="truncate text-xs text-sidebar-foreground/70">{session?.user?.email ?? ""}</span>
          </div>

          {/* Ações de conta: trocar senha, tema e sair. */}
          <div className="flex shrink-0 items-center gap-0.5 group-data-[collapsible=icon]:flex-col">
            <button
              type="button"
              onClick={() => setSenhaOpen(true)}
              aria-label="Trocar senha"
              title="Trocar senha"
              className={BOTAO_RODAPE}
            >
              <Lock className="size-4" strokeWidth={TRACO} />
            </button>
            <ThemeToggle className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className={BOTAO_RODAPE}
            >
              <LogOut className="size-4" strokeWidth={TRACO} />
            </button>
          </div>
        </div>
      </SidebarFooter>

      <TrocarSenhaDialog open={senhaOpen} onClose={() => setSenhaOpen(false)} />
    </Sidebar>
  );
}
